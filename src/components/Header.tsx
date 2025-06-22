import React from 'react';
import { View, Text, StyleSheet, Image, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { User } from '../types/workOrder';

interface HeaderProps {
  user: User;
  isConnected?: boolean;
}

const Header: React.FC<HeaderProps> = ({ user }) => {
  return (
    <View style={styles.headerWrapper}>
      <ImageBackground
        source={require('../img-ref/container_perfil.png')}
        style={styles.headerImage}
        resizeMode="cover"
      >
        <View style={styles.header}>
          <View style={styles.userSection}>
            <View style={styles.avatar}>
              {user.url_foto ? (
                <Image source={{ uri: user.url_foto }} style={styles.userPhoto} />
              ) : (
                <Ionicons name="person" size={30} color="white" />
              )}
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userRole}>{user.role}</Text>
            </View>
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
    paddingBottom: 10,
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
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  userInfo: {
    marginLeft: 10,
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
    width: 70,
    height: 70,
    borderRadius: 35,
  },
});

export default Header; 