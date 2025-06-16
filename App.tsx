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
import PhotoCollectionScreen from './src/screens/PhotoCollectionScreen';
import AuditSavingScreen from './src/screens/AuditSavingScreen';
import AuditSuccessScreen from './src/screens/AuditSuccessScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { WorkOrder } from './src/types/workOrder';
import { startAutoSync, syncAllPendingActions } from './src/services/offlineService';
import { updateLocalWorkOrderStatus } from './src/services/localStatusService';
import { updateWorkOrderStatus } from './src/services/workOrderService';
import AsyncStorage from '@react-native-async-storage/async-storage';

type CurrentScreen = 'main' | 'profile' | 'workOrderDetail' | 'startService' | 'steps' | 'audit' | 'photoCollection' | 'auditSaving' | 'auditSuccess';

function AppContent() {
  const { appUser, loading, initialLoading, initialProgress } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('main');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [refreshMainScreen, setRefreshMainScreen] = useState(0); // Para forçar refresh

  // Inicializar monitoramento de sincronização
  useEffect(() => {
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

  const handleStartService = async () => {
    if (selectedWorkOrder) {
      // Se a OS já está em progresso, ir direto para as etapas
      if (selectedWorkOrder.status === 'em_progresso') {
        setCurrentScreen('steps');
        return;
      }

      try {
        // Verificar se já existe foto inicial (online ou offline)
        const { hasInitialPhoto } = await import('./src/services/auditService');
        const { hasPhoto, error } = await hasInitialPhoto(selectedWorkOrder.id);
        
        if (error) {
          setCurrentScreen('startService');
          return;
        }

        if (hasPhoto) {
          console.log('✅ Foto inicial existe - pulando para etapas');
          // Atualizar status local para em_progresso se ainda não estiver
          if (selectedWorkOrder.status !== 'em_progresso') {
            await updateLocalWorkOrderStatus(selectedWorkOrder.id, 'em_progresso', false);
            setSelectedWorkOrder({
              ...selectedWorkOrder,
              status: 'em_progresso'
            });
          }
          setCurrentScreen('steps');
        } else {
          setCurrentScreen('startService');
        }
      } catch (error) {
        // Em caso de erro, ir para tela de início normalmente
        setCurrentScreen('startService');
      }
    }
  };

  const handleConfirmStart = async (photo?: string) => {
    console.log('🚀 Iniciando handleConfirmStart');
    console.log('📷 Foto recebida:', photo ? 'Sim' : 'Não');
    console.log('📋 OS selecionada:', selectedWorkOrder?.id);
    
    if (selectedWorkOrder) {
      try {
        console.log('⏳ Atualizando status local para em_progresso...');
        
        // Atualizar status local primeiro
        try {
          await updateLocalWorkOrderStatus(selectedWorkOrder.id, 'em_progresso', false);
          console.log('✅ Status local atualizado com sucesso');
        } catch (statusError) {
          console.error('❌ Erro ao atualizar status local:', statusError);
          // Continuar mesmo com erro de status
        }
        
        // Atualizar o objeto selectedWorkOrder localmente
        setSelectedWorkOrder({
          ...selectedWorkOrder,
          status: 'em_progresso'
        });
        console.log('✅ Estado selectedWorkOrder atualizado');
        
        // Ir para a tela de etapas do serviço
        console.log('🔄 Navegando para tela de etapas...');
        setCurrentScreen('steps');
        console.log('✅ Navegação concluída');
      } catch (error) {
        console.error('❌ Erro no handleConfirmStart:', error);
        if (error instanceof Error) {
          console.error('❌ Stack trace:', error.stack);
          console.error('❌ Mensagem:', error.message);
        }
        // Mesmo com erro, continuar para a tela de etapas
        console.log('⚠️ Continuando mesmo com erro...');
        setCurrentScreen('steps');
      }
    } else {
      console.error('❌ selectedWorkOrder é null!');
      throw new Error('Ordem de serviço não selecionada');
    }
  };

  const handleFinishService = async () => {
    if (selectedWorkOrder) {
      try {
        // Verificar se já existe foto final (online ou offline)
        const { hasFinalPhoto } = await import('./src/services/auditService');
        const { hasPhoto, error } = await hasFinalPhoto(selectedWorkOrder.id);
        
        if (error) {
          setCurrentScreen('audit');
          return;
        }

        if (hasPhoto) {
          console.log('✅ Foto final existe - pulando para coleta de fotos');
          setCurrentScreen('photoCollection');
        } else {
          setCurrentScreen('audit');
        }
      } catch (error) {
        // Em caso de erro, ir para auditoria normalmente
        setCurrentScreen('audit');
      }
    }
  };

  const handleSkipToPhotoCollection = async () => {
    // Pular direto para a tela de coleta de fotos
    setCurrentScreen('photoCollection');
  };

  const handleFinishAudit = async (auditData: any) => {
    // Ir para a tela de coleta de fotos
    setCurrentScreen('photoCollection');
  };

  const handleFinishPhotoCollection = async (photos: { [entryId: number]: string }) => {
    console.log(`📸 Finalizando coleta: ${Object.keys(photos).length} fotos`);
    
    // Ir para a tela de salvamento da auditoria
    setCurrentScreen('auditSaving');
  };

  const handleFinishAuditSaving = async () => {
    console.log('🔄 handleFinishAuditSaving iniciado');
    
    if (selectedWorkOrder) {
      try {
        console.log('⏳ Atualizando status local para finalizada...');
        
        // SIMPLIFICADO - Salvar status APENAS localmente no AsyncStorage
        try {
          const statusData = {
            status: 'finalizada',
            synced: false,
            updatedAt: new Date().toISOString(),
          };
          
          await AsyncStorage.setItem(
            `local_work_order_status_${selectedWorkOrder.id}`,
            JSON.stringify(statusData)
          );
          console.log('✅ Status local salvo diretamente no AsyncStorage');
        } catch (statusError) {
          console.error('❌ Erro ao salvar status local:', statusError);
          // Continuar mesmo com erro de status
        }
        
        // REMOVIDO: updateWorkOrderStatus que pode fazer requisições online
        console.log('📱 Operação offline - sem tentativa de sincronização online');
        
      } catch (error) {
        console.error('❌ Erro ao finalizar OS:', error);
      }
    } else {
      console.log('⚠️ selectedWorkOrder é null');
    }
    
    // Ir para a tela de sucesso
    console.log('🚀 Navegando para tela de sucesso...');
    setCurrentScreen('auditSuccess');
    console.log('✅ Navegação concluída');
  };

  const handleDownloadReport = () => {
    // TODO: Implementar download do relatório
  };

  const handleViewWorkOrders = () => {
    console.log('🔄 Voltando para lista de OSs');
    
    // Voltar para a tela principal SIMPLIFICADO - SEM TIMEOUTS OU STATES COMPLEXOS
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
    
    // REMOVIDO: setTimeout e setRefreshMainScreen que podem causar loops
    console.log('✅ Navegação para main concluída');
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

  return (
    <View style={styles.container}>
      {/* Conteúdo principal do app */}
      {currentScreen === 'main' && renderMainScreen()}
      {currentScreen === 'profile' && (
        <ProfileScreen 
          user={appUser} 
          onBackPress={handleBackToMain}
          onTabPress={handleTabPress}
        />
      )}
      {currentScreen === 'workOrderDetail' && selectedWorkOrder && (
        <WorkOrderDetailScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackToMain}
          onTabPress={handleTabPress}
          onStartService={handleStartService}
        />
      )}
      {currentScreen === 'steps' && selectedWorkOrder && (
        <ServiceStepsScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackToMain}
          onTabPress={handleTabPress}
          onFinishService={handleFinishService}
        />
      )}
      {currentScreen === 'startService' && selectedWorkOrder && (
        <StartServiceScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackToMain}
          onTabPress={handleTabPress}
          onConfirmStart={handleConfirmStart}
        />
      )}
      {currentScreen === 'audit' && selectedWorkOrder && (
        <PostServiceAuditScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackToMain}
          onTabPress={handleTabPress}
          onFinishAudit={handleFinishAudit}
        />
      )}
      {currentScreen === 'photoCollection' && selectedWorkOrder && (
        <PhotoCollectionScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackToMain}
          onTabPress={handleTabPress}
          onFinishPhotoCollection={handleFinishPhotoCollection}
        />
      )}
      {currentScreen === 'auditSaving' && selectedWorkOrder && (
        <AuditSavingScreen
          workOrder={selectedWorkOrder}
          onFinishSaving={handleFinishAuditSaving}
        />
      )}
      {currentScreen === 'auditSuccess' && selectedWorkOrder && (
        <AuditSuccessScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onTabPress={handleTabPress}
          onDownloadReport={handleDownloadReport}
          onViewWorkOrders={handleViewWorkOrders}
        />
      )}
    </View>
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
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
});
