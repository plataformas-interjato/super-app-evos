import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { User } from './src/types/workOrder';

type CurrentScreen = 'login' | 'main' | 'profile';

// Usuários mockados para validação
const mockUsers: { [key: string]: User } = {
  'gestor@teste.com': {
    id: '1',
    name: 'João Silva',
    role: 'Gestor',
    userType: 'gestor',
  },
  'tecnico@teste.com': {
    id: '2',
    name: 'Maria Santos',
    role: 'Técnico',
    userType: 'tecnico',
  },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('login');

  const handleLogin = (email: string, password: string) => {
    // Verificar se o usuário existe nos dados mockados
    const authenticatedUser = mockUsers[email.toLowerCase()];
    
    if (authenticatedUser) {
      setUser(authenticatedUser);
      setCurrentScreen('main');
    } else {
      // Se não encontrar, usar usuário padrão (técnico) para demonstração
      const defaultUser: User = {
        id: '3',
        name: 'Usuário Padrão',
        role: 'Técnico',
        userType: 'tecnico',
      };
      setUser(defaultUser);
      setCurrentScreen('main');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentScreen('login');
  };

  const handleTabPress = (tab: 'home' | 'profile') => {
    if (tab === 'home') {
      setCurrentScreen('main');
    } else if (tab === 'profile') {
      setCurrentScreen('profile');
    }
  };

  const handleBackToMain = () => {
    setCurrentScreen('main');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const renderMainScreen = () => {
    if (!user) return null;
    
    // Regra de negócio: Gestor vê ManagerScreen, Técnico vê MainScreen
    if (user.userType === 'gestor') {
      return <ManagerScreen user={user} onTabPress={handleTabPress} />;
    } else {
      return <MainScreen user={user} onTabPress={handleTabPress} />;
    }
  };

  const renderCurrentScreen = () => {
    if (!user) {
      return <LoginScreen onLogin={handleLogin} />;
    }

    switch (currentScreen) {
      case 'main':
        return renderMainScreen();
      case 'profile':
        return (
          <ProfileScreen 
            user={user} 
            onBackPress={handleBackToMain}
            onTabPress={handleTabPress}
          />
        );
      default:
        return renderMainScreen();
    }
  };

  return (
    <>
      <StatusBar style="light" />
      {renderCurrentScreen()}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
});
