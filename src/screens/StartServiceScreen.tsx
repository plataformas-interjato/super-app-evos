import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import * as ImagePicker from 'expo-image-picker';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';

interface StartServiceScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onConfirmStart: (photo?: string) => void;
}

const StartServiceScreen: React.FC<StartServiceScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onConfirmStart,
}) => {
  const [photo, setPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permissão Necessária',
        'É necessário permitir o acesso à câmera para tirar fotos.'
      );
      return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhoto(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
    }
  };

  const removePhoto = () => {
    Alert.alert(
      'Remover Foto',
      'Deseja remover a foto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', onPress: () => setPhoto(null) },
      ]
    );
  };

  const handleConfirmStart = async () => {
    setIsLoading(true);
    try {
      await onConfirmStart(photo || undefined);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível iniciar a ordem de serviço.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Iniciar Ordem de Serviço</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Confirmação do Usuário - Movido para o primeiro card */}
        <View style={styles.orderInfoCard}>
          <Text style={styles.sectionTitle}>Confirmação do Técnico</Text>
          
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              {user.url_foto ? (
                <Image source={{ uri: user.url_foto }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={32} color="#666" />
              )}
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userRole}>{user.role}</Text>
            </View>
            <View style={styles.confirmationIcon}>
              <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            </View>
          </View>
          
          <Text style={styles.securityText}>
            Por motivos de segurança, confirme sua identidade antes de iniciar a ordem de serviço.
          </Text>
        </View>

        {/* Seção de Foto - Sem container */}
        <Text style={styles.photoSectionTitle}>Foto de Início</Text>
        <Text style={styles.photoSectionSubtitle}>
          Tire uma foto para registrar o início da atividade
        </Text>
        
        <View style={styles.photoAreaContainer}>
          {photo ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photo }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.removePhotoButton} onPress={removePhoto}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.takePhotoButton} onPress={takePhoto}>
              <Ionicons name="camera" size={32} color="#666" />
              <Text style={styles.takePhotoText}>Tirar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Botão de Confirmar */}
        <TouchableOpacity 
          style={[styles.confirmButton, isLoading && styles.confirmButtonDisabled]} 
          onPress={handleConfirmStart}
          disabled={isLoading}
        >
          <Text style={styles.confirmButtonText}>
            {isLoading ? 'Iniciando...' : 'Confirmar Início da Ordem de Serviço'}
          </Text>
        </TouchableOpacity>

        {/* Espaço para o bottom navigation */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigationContainer}>
        <BottomNavigation 
          activeTab="home" 
          onTabPress={onTabPress}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    color: 'white',
    fontSize: RFValue(18),
    fontWeight: '600',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  orderInfoCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  userDetails: {
    flex: 1,
    marginLeft: 16,
  },
  userName: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
  },
  userRole: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginTop: 2,
  },
  confirmationIcon: {
    marginLeft: 8,
  },
  securityText: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  photoSectionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    marginTop: 24,
    textAlign: 'center',
  },
  photoSectionSubtitle: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  photoAreaContainer: {
    alignItems: 'center',
  },
  photoContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  photoPreview: {
    width: 200,
    height: 250,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    resizeMode: 'contain',
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  takePhotoButton: {
    borderWidth: 2,
    borderColor: '#000000',
    borderStyle: 'dashed',
    borderRadius: 12,
    width: 200,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  takePhotoText: {
    marginTop: 8,
    fontSize: RFValue(14),
    color: '#6b7280',
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: '#E0ED54',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#1f2937',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomNavigationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

export default StartServiceScreen; 