import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WorkOrderDetailScreen from './src/screens/WorkOrderDetailScreen';
import StartServiceScreen from './src/screens/StartServiceScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { WorkOrder } from './src/types/workOrder';
import { startAutoSync, syncAllPendingActions } from './src/services/offlineService';

type CurrentScreen = 'main' | 'profile' | 'workOrderDetail' | 'startService';

function AppContent() {
  const { appUser, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('main');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);

  // Inicializar monitoramento de sincronização
  useEffect(() => {
    console.log('🚀 Inicializando sistema de sincronização offline...');
    
    // Iniciar monitoramento automático
    const unsubscribe = startAutoSync();
    
    // Tentar sincronizar ações pendentes na inicialização (com delay)
    const initSync = setTimeout(() => {
      syncAllPendingActions().then(result => {
        if (result.total > 0) {
          console.log(`📊 Sincronização inicial: ${result.synced}/${result.total} ações sincronizadas`);
        }
      });
    }, 5000); // 5 segundos após inicialização

    // Cleanup na desmontagem
    return () => {
      console.log('🛑 Parando monitoramento de sincronização');
      clearTimeout(initSync);
      unsubscribe();
    };
  }, []);

  const handleTabPress = (tab: 'home' | 'profile') => {
    if (tab === 'home') {
      setCurrentScreen('main');
    } else if (tab === 'profile') {
      setCurrentScreen('profile');
    }
  };

  const handleBackToMain = () => {
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
  };

  const handleOpenWorkOrder = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setCurrentScreen('workOrderDetail');
  };

  const handleStartService = () => {
    // Navegar para a tela de iniciar serviço
    setCurrentScreen('startService');
  };

  const handleConfirmStart = async (photo?: string) => {
    // Implementar lógica para confirmar início (salvar foto, atualizar status, etc.)
    console.log('Confirmando início do serviço para OS:', selectedWorkOrder?.id);
    console.log('Foto:', photo ? 'Foto capturada' : 'Sem foto');
    
    // Por exemplo, mudar o status para 'em_progresso'
    if (selectedWorkOrder) {
      const updatedWorkOrder = { ...selectedWorkOrder, status: 'em_progresso' as const };
      setSelectedWorkOrder(updatedWorkOrder);
    }
    
    // Voltar para a tela principal
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
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
      return <MainScreen user={appUser} onTabPress={handleTabPress} onOpenWorkOrder={handleOpenWorkOrder} />;
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
      case 'workOrderDetail':
        return selectedWorkOrder ? (
          <WorkOrderDetailScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onBackPress={handleBackToMain}
            onTabPress={handleTabPress}
            onStartService={handleStartService}
          />
        ) : null;
      case 'startService':
        return selectedWorkOrder ? (
          <StartServiceScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onBackPress={() => setCurrentScreen('workOrderDetail')}
            onTabPress={handleTabPress}
            onConfirmStart={handleConfirmStart}
          />
        ) : null;
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
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
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
