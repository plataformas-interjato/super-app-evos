import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Image, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { User } from '../types/workOrder';
import { useAuth } from '../contexts/AuthContext';

interface ProfileHeaderProps {
  user: User;
  onBackPress: () => void;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user, onBackPress }) => {
  const { signOut } = useAuth();

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
              <View style={styles.avatar}>
                {user.url_foto ? (
                  <Image source={{ uri: user.url_foto }} style={styles.userPhoto} />
                ) : (
                  <Ionicons name="person" size={50} color="white" />
                )}
              </View>
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
});

export default ProfileHeader; 