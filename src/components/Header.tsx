import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { User } from '../types/workOrder';

interface HeaderProps {
  user: User;
  isConnected: boolean;
}

const Header: React.FC<HeaderProps> = ({ user, isConnected }) => {
  const getCurrentDate = () => {
    return new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <LinearGradient
      colors={['#1e3a8a', '#3b82f6']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.userSection}>
        <View style={styles.userIcon}>
          <Ionicons name="person" size={24} color="white" />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>Nome</Text>
          <Text style={styles.userRole}>{user.role}</Text>
        </View>
      </View>

      <View style={styles.statusSection}>
        <View style={styles.connectionStatus}>
          <Ionicons 
            name="wifi" 
            size={16} 
            color={isConnected ? "#10b981" : "#ef4444"} 
          />
          <Text style={[
            styles.connectionText,
            { color: isConnected ? "#10b981" : "#ef4444" }
          ]}>
            {isConnected ? "CONECTADO" : "SEM CONEXÃO"}
          </Text>
        </View>

        <View style={styles.dateSection}>
          <Ionicons name="calendar" size={16} color="white" />
          <Text style={styles.dateText}>{getCurrentDate()}</Text>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  userIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userRole: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  statusSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    color: 'white',
    marginLeft: 5,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default Header; 