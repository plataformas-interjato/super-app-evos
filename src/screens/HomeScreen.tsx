import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RFValue } from 'react-native-responsive-fontsize';

interface HomeScreenProps {
  userEmail: string;
  onLogout: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ userEmail, onLogout }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bem-vindo!</Text>
      <Text style={styles.subtitle}>
        Olá, {userEmail}
      </Text>
      
      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutButtonText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 20,
  },
  title: {
    fontSize: RFValue(28),
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: RFValue(18),
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
});

export default HomeScreen;
