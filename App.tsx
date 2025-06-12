import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

type CurrentScreen = 'main' | 'profile';

function AppContent() {
  const { appUser, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('main');

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

  // Se não há usuário autenticado, mostrar tela de login
  if (!appUser) {
    return <LoginScreen />;
  }

  const renderMainScreen = () => {
    // Regra de negócio: Gestor vê ManagerScreen, Técnico vê MainScreen
    if (appUser.userType === 'gestor') {
      return <ManagerScreen user={appUser} onTabPress={handleTabPress} />;
    } else {
      return <MainScreen user={appUser} onTabPress={handleTabPress} />;
    }
  };

  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'main':
        return renderMainScreen();
      case 'profile':
        return (
          <ProfileScreen 
            user={appUser} 
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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
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
