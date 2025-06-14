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
import ServiceStepsScreen from './src/screens/ServiceStepsScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { WorkOrder } from './src/types/workOrder';
import { startAutoSync, syncAllPendingActions } from './src/services/offlineService';
import { updateWorkOrderStatus } from './src/services/workOrderService';

type CurrentScreen = 'main' | 'profile' | 'workOrderDetail' | 'startService' | 'steps';

function AppContent() {
  const { appUser, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('main');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');

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
    setActiveTab(tab);
    if (tab === 'home') {
      setCurrentScreen('main');
      setSelectedWorkOrder(null);
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
    if (selectedWorkOrder) {
      // Se a OS já está em progresso, ir direto para as etapas
      if (selectedWorkOrder.status === 'em_progresso') {
        console.log('OS já em progresso, indo direto para etapas');
        setCurrentScreen('steps');
      } else {
        // Se não está em progresso, ir para a tela de iniciar serviço
        console.log('OS aguardando, indo para tela de início');
        setCurrentScreen('startService');
      }
    }
  };

  const handleConfirmStart = async (photo?: string) => {
    console.log('Confirmando início do serviço para OS:', selectedWorkOrder?.id);
    console.log('Foto:', photo ? 'Foto capturada' : 'Sem foto');
    
    if (selectedWorkOrder) {
      try {
        // Atualizar status da OS para 'em_progresso'
        const { data, error } = await updateWorkOrderStatus(
          selectedWorkOrder.id.toString(), 
          'em_progresso'
        );
        
        if (error) {
          console.error('Erro ao atualizar status:', error);
          // Continuar mesmo com erro, pois a foto já foi salva
        }
        
        // Ir para a tela de etapas do serviço
        setCurrentScreen('steps');
      } catch (error) {
        console.error('Erro ao confirmar início:', error);
        // Mesmo com erro, continuar para a tela de etapas
        setCurrentScreen('steps');
      }
    }
  };

  const handleFinishService = async () => {
    console.log('Finalizando serviço para OS:', selectedWorkOrder?.id);
    
    if (selectedWorkOrder) {
      try {
        // Atualizar status da OS para 'finalizada'
        const { data, error } = await updateWorkOrderStatus(
          selectedWorkOrder.id.toString(), 
          'finalizada'
        );
        
        if (error) {
          console.error('Erro ao finalizar serviço:', error);
        } else {
          console.log('✅ Serviço finalizado com sucesso');
        }
      } catch (error) {
        console.error('Erro ao finalizar serviço:', error);
      }
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
      case 'steps':
        return selectedWorkOrder ? (
          <ServiceStepsScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onBackPress={() => {
              // Sempre voltar para a home
              setCurrentScreen('main');
              setSelectedWorkOrder(null);
            }}
            onTabPress={handleTabPress}
            onFinishService={handleFinishService}
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
