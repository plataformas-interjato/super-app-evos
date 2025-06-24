import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, ImageBackground, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import * as ImagePicker from 'expo-image-picker';
import { User } from '../types/workOrder';
import { useAuth } from '../contexts/AuthContext';
import { updateUserPhoto } from '../services/userService';

interface ProfileHeaderProps {
  user: User;
  onBackPress: () => void;
  onPhotoUpdated?: (newPhotoUrl: string) => void; // Callback para notificar atualização da foto
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user, onBackPress, onPhotoUpdated }) => {
  const { signOut, updateUser } = useAuth();
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(user.url_foto);

  const handleLogout = () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair da sua conta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Sair', 
          style: 'destructive',
          onPress: () => signOut()
        },
      ]
    );
  };

  const handlePhotoPress = () => {
    // Verificar se o usuário é gestor ou supervisor para permitir edição
    const funcao = user.funcao_original?.toLowerCase() || user.userType;
    const canEditPhoto = funcao === 'gestor' || funcao === 'supervisor' || user.userType === 'gestor';

    if (!canEditPhoto) {
      Alert.alert(
        'Permissão Negada',
        'Apenas gestores e supervisores podem alterar a foto de perfil.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Atualizar Foto',
      'Escolha uma opção para atualizar sua foto de perfil:',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Câmera', onPress: () => pickImage('camera') },
        { text: 'Galeria', onPress: () => pickImage('library') },
      ]
    );
  };

  const pickImage = async (source: 'camera' | 'library') => {
    try {
      // Solicitar permissões
      let permissionResult;
      
      if (source === 'camera') {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (permissionResult.granted === false) {
        Alert.alert(
          'Permissão Necessária',
          `É necessário permitir o acesso ${source === 'camera' ? 'à câmera' : 'à galeria'} para atualizar a foto.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // Selecionar imagem
      let result;
      
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
        });
      }

      if (!result.canceled && result.assets[0].base64) {
        await updatePhoto(result.assets[0].base64, result.assets[0].mimeType || 'image/jpeg');
      }

    } catch (error) {
      console.error('❌ Erro ao selecionar imagem:', error);
      Alert.alert(
        'Erro',
        'Erro ao selecionar imagem. Tente novamente.',
        [{ text: 'OK' }]
      );
    }
  };

  const updatePhoto = async (base64: string, mimeType: string) => {
    setIsUpdatingPhoto(true);

    try {
      // Criar URL base64 completa
      const photoBase64 = `data:${mimeType};base64,${base64}`;

      // Validar tamanho da imagem (limite de ~1MB para base64)
      if (photoBase64.length > 1400000) { // ~1MB em base64
        Alert.alert(
          'Imagem Muito Grande',
          'A imagem selecionada é muito grande. Escolha uma imagem menor ou reduza a qualidade.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Atualizar no Supabase
      const result = await updateUserPhoto(user.id, photoBase64);

      if (result.success && result.photoUrl) {
        // Atualizar estado local
        setCurrentPhotoUrl(result.photoUrl);
        
        // Atualizar contexto global do usuário
        updateUser({ url_foto: result.photoUrl });
        
        // Notificar componente pai sobre a atualização
        if (onPhotoUpdated) {
          onPhotoUpdated(result.photoUrl);
        }

        Alert.alert(
          'Sucesso',
          'Foto de perfil atualizada com sucesso!',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Erro',
          result.error || 'Erro ao atualizar foto. Tente novamente.',
          [{ text: 'OK' }]
        );
      }

    } catch (error) {
      console.error('❌ Erro ao atualizar foto:', error);
      Alert.alert(
        'Erro',
        'Erro inesperado ao atualizar foto. Tente novamente.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  return (
    <View style={styles.headerWrapper}>
      <ImageBackground
        source={require('../img-ref/container_perfil.png')}
        style={styles.headerImage}
        resizeMode="cover"
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBackPress}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="white" />
          </TouchableOpacity>
          
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              <TouchableOpacity 
                style={styles.avatar} 
                onPress={handlePhotoPress}
                disabled={isUpdatingPhoto}
              >
                {currentPhotoUrl ? (
                  <Image source={{ uri: currentPhotoUrl }} style={styles.userPhoto} />
                ) : (
                  <Ionicons name="person" size={50} color="white" />
                )}
                
                {/* Overlay de edição */}
                <View style={styles.editOverlay}>
                  {isUpdatingPhoto ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="camera" size={20} color="white" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userRole}>{user.role}</Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  headerWrapper: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerImage: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    paddingTop: 15,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: 15,
    left: 20,
    zIndex: 1,
  },
  logoutButton: {
    position: 'absolute',
    top: 15,
    right: 20,
    zIndex: 1,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 5,
    paddingBottom: 15,
  },
  avatarContainer: {
    marginBottom: 8,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  userName: {
    color: 'white',
    fontSize: RFValue(24),
    fontWeight: 'bold',
    marginBottom: 2,
  },
  userRole: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: RFValue(16),
    fontWeight: '500',
  },
  userPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  editOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProfileHeader; 