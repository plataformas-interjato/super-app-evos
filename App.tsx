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
import PostServiceAuditScreen from './src/screens/PostServiceAuditScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { WorkOrder } from './src/types/workOrder';
import { startAutoSync, syncAllPendingActions, saveStatusUpdateOffline } from './src/services/offlineService';
import { updateWorkOrderStatus } from './src/services/workOrderService';
import { updateLocalWorkOrderStatus } from './src/services/localStatusService';

type CurrentScreen = 'main' | 'profile' | 'workOrderDetail' | 'startService' | 'steps' | 'audit';

function AppContent() {
  const { appUser, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('main');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [refreshMainScreen, setRefreshMainScreen] = useState(0); // Para forçar refresh

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
        // Atualizar status local primeiro
        await updateLocalWorkOrderStatus(selectedWorkOrder.id, 'em_progresso', false);
        
        // Tentar atualizar status online/offline
        const { success, savedOffline } = await saveStatusUpdateOffline(
          selectedWorkOrder.id, 
          'em_progresso'
        );
        
        if (!success) {
          console.error('Erro ao atualizar status, mas continuando...');
        }
        
        // Atualizar o objeto selectedWorkOrder localmente
        setSelectedWorkOrder({
          ...selectedWorkOrder,
          status: 'em_progresso'
        });
        
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
    console.log('Navegando para auditoria pós-serviço para OS:', selectedWorkOrder?.id);
    
    // Navegar para a tela de auditoria pós-serviço
    setCurrentScreen('audit');
  };

  const handleFinishAudit = async (auditData: any) => {
    console.log('Finalizando auditoria para OS:', selectedWorkOrder?.id, auditData);
    
    if (selectedWorkOrder) {
      try {
        // Atualizar status local primeiro
        await updateLocalWorkOrderStatus(selectedWorkOrder.id, 'finalizada', false);
        
        // Tentar atualizar status online/offline
        const { success, savedOffline } = await saveStatusUpdateOffline(
          selectedWorkOrder.id, 
          'finalizada'
        );
        
        if (!success) {
          console.error('Erro ao finalizar serviço, mas continuando...');
        } else {
          console.log('✅ Serviço finalizado com sucesso');
        }
        
        // A auditoria já foi salva na tela PostServiceAuditScreen
        console.log('✅ Auditoria finalizada:', auditData);
        
      } catch (error) {
        console.error('Erro ao finalizar serviço:', error);
      }
    }
    
    // Voltar para a tela principal primeiro
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
    
    // Forçar refresh da MainScreen com delay para dar tempo do contexto se estabilizar
    setTimeout(() => {
      setRefreshMainScreen(prev => prev + 1);
      console.log('🔄 Forçando refresh da MainScreen após finalização da auditoria (com delay)');
    }, 1000); // 1 segundo de delay
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
      return <MainScreen user={appUser} onTabPress={handleTabPress} onOpenWorkOrder={handleOpenWorkOrder} refreshTrigger={refreshMainScreen} />;
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
      case 'audit':
        return selectedWorkOrder ? (
          <PostServiceAuditScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onBackPress={() => setCurrentScreen('steps')}
            onTabPress={handleTabPress}
            onFinishAudit={handleFinishAudit}
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
