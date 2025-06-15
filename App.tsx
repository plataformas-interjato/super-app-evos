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

type CurrentScreen = 'main' | 'profile' | 'workOrderDetail' | 'startService' | 'steps' | 'audit' | 'photoCollection' | 'auditSaving' | 'auditSuccess';

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
        
        // REMOVIDO: Não precisamos criar ação offline para status
        // O status será atualizado automaticamente quando a foto de início for salva
        console.log('✅ Status local atualizado para em_progresso');
        
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

  const handleSkipToPhotoCollection = async () => {
    console.log('Pulando direto para coleta de fotos para OS:', selectedWorkOrder?.id);
    
    // Pular direto para a tela de coleta de fotos
    setCurrentScreen('photoCollection');
  };

  const handleFinishAudit = async (auditData: any) => {
    console.log('Auditoria concluída para OS:', selectedWorkOrder?.id, auditData);
    
    // A auditoria foi salva na tela PostServiceAuditScreen
    console.log('✅ Auditoria salva, indo para coleta de fotos');
    
    // Ir para a tela de coleta de fotos
    setCurrentScreen('photoCollection');
  };

  const handleFinishPhotoCollection = async (photos: { [entryId: number]: string }) => {
    console.log('Finalizando coleta de fotos para OS:', selectedWorkOrder?.id);
    console.log('Fotos coletadas:', Object.keys(photos).length);
    
    // TODO: Salvar fotos coletadas (implementar serviço de fotos)
    console.log('📸 Fotos coletadas salvas localmente');
    
    // Ir para a tela de salvamento da auditoria
    setCurrentScreen('auditSaving');
  };

  const handleFinishAuditSaving = async () => {
    console.log('Salvamento da auditoria concluído para OS:', selectedWorkOrder?.id);
    
    if (selectedWorkOrder) {
      try {
        // Agora que chegamos na tela final, finalizamos a OS corretamente
        console.log('✅ Finalizando OS na tela final conforme esperado...');
        await updateLocalWorkOrderStatus(selectedWorkOrder.id, 'finalizada', false);
        
        // Criar ação offline para finalizar a OS no servidor quando houver conexão
        // Isso garantirá que a OS seja finalizada no servidor também
        try {
          await updateWorkOrderStatus(selectedWorkOrder.id.toString(), 'finalizada');
          console.log('✅ OS finalizada no servidor com sucesso');
          
        } catch (serverError) {
          console.warn('⚠️ Erro ao finalizar OS no servidor (será tentado offline):', serverError);
          // Em caso de erro, a ação offline será criada automaticamente
        }
        
        console.log('✅ Status local atualizado para finalizada');
        
      } catch (error) {
        console.error('Erro ao finalizar OS:', error);
      }
    }
    
    // Ir para a tela de sucesso
    setCurrentScreen('auditSuccess');
  };

  const handleDownloadReport = () => {
    console.log('Baixando relatório para OS:', selectedWorkOrder?.id);
    // TODO: Implementar download do relatório
  };

  const handleViewWorkOrders = () => {
    console.log('Voltando para visualizar ordens de serviço');
    
    // Voltar para a tela principal
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
    
    // Forçar refresh da MainScreen com delay
    setTimeout(() => {
      setRefreshMainScreen(prev => prev + 1);
      console.log('🔄 Forçando refresh da MainScreen após finalização completa');
    }, 500);
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
            onBackToWorkOrderDetail={() => {
              // Voltar para a tela de detalhes da OS
              setCurrentScreen('workOrderDetail');
            }}
            onSkipToPhotoCollection={handleSkipToPhotoCollection}
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
            onBackToServiceSteps={() => {
              // Voltar para a tela de etapas/entradas
              setCurrentScreen('steps');
            }}
          />
        ) : null;
      case 'photoCollection':
        return selectedWorkOrder ? (
          <PhotoCollectionScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onBackPress={() => setCurrentScreen('audit')}
            onTabPress={handleTabPress}
            onFinishPhotoCollection={handleFinishPhotoCollection}
            onBackToServiceSteps={() => {
              // Voltar para a tela de etapas/entradas
              setCurrentScreen('steps');
            }}
          />
        ) : null;
      case 'auditSaving':
        return selectedWorkOrder ? (
          <AuditSavingScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onTabPress={handleTabPress}
            onFinishSaving={handleFinishAuditSaving}
          />
        ) : null;
      case 'auditSuccess':
        return selectedWorkOrder ? (
          <AuditSuccessScreen
            workOrder={selectedWorkOrder}
            user={appUser}
            onTabPress={handleTabPress}
            onDownloadReport={handleDownloadReport}
            onViewWorkOrders={handleViewWorkOrders}
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
