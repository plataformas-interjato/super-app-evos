import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen from './src/screens/MainScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WorkOrderDetailScreen from './src/screens/WorkOrderDetailScreen';
import OrderEvaluationScreen from './src/screens/OrderEvaluationScreen';
import StartServiceScreen from './src/screens/StartServiceScreen';
import ServiceStepsScreen from './src/screens/ServiceStepsScreen';
import PostServiceAuditScreen from './src/screens/PostServiceAuditScreen';
import PhotoCollectionScreen from './src/screens/PhotoCollectionScreen';
import AuditSavingScreen from './src/screens/AuditSavingScreen';
import AuditSuccessScreen from './src/screens/AuditSuccessScreen';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { WorkOrder } from './src/types/workOrder';
import { startAutoSync, syncAllPendingActions, cleanOrphanedOfflineData } from './src/services/integratedOfflineService';
import { updateLocalWorkOrderStatus } from './src/services/localStatusService';
import { updateWorkOrderStatus } from './src/services/workOrderService';
import { saveEvaluation } from './src/services/evaluationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
// REMOVIDO: importações do sistema híbrido que causam erro database full
// import storageAdapter from './src/services/storageAdapter';
// import hybridStorage from './src/services/hybridStorageService';

// Importar debug function
import { debugEntradasDados } from './src/services/debugEntradasDados';
import { debugSyncStatusForWorkOrder, forceSyncPhotosForWorkOrder } from './src/services/integratedOfflineService';

// NOVO: Importar sistema de fotos seguro
import { initializePhotoSystem, demonstratePhotoSystem } from './src/services/photoSystemInit';
import smartOfflineDataService from './src/services/smartOfflineDataService';

// Disponibilizar debug no console global
(global as any).debugEntradasDados = debugEntradasDados;
(global as any).debugSyncStatus = debugSyncStatusForWorkOrder;
(global as any).forceSyncPhotos = syncAllPendingActions;
(global as any).forceSyncForOS = forceSyncPhotosForWorkOrder;

type CurrentScreen = 'main' | 'profile' | 'workOrderDetail' | 'orderEvaluation' | 'startService' | 'steps' | 'audit' | 'photoCollection' | 'auditSaving' | 'auditSuccess';

function AppContent() {
  const { appUser, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<CurrentScreen>('main');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [refreshMainScreen, setRefreshMainScreen] = useState(0); // Para forçar refresh

  // Inicializar monitoramento de sincronização
  useEffect(() => {
    // Iniciar monitoramento automático
    const unsubscribe = startAutoSync();
    
    // NOVO: Inicializar sistema de fotos seguro
    initializePhotoSystem().then(result => {
      if (result.success) {
        console.log('🎉 Sistema de fotos seguro inicializado com sucesso');
        // Executar demonstração no console (opcional)
        demonstratePhotoSystem();
      } else {
        console.warn('⚠️ Falha na inicialização do sistema de fotos:', result.message);
      }
    }).catch(error => {
      console.error('❌ Erro crítico na inicialização do sistema de fotos:', error);
    });
    
    // Tentar sincronizar ações pendentes na inicialização (com delay)
    const initSync = setTimeout(() => {
      syncAllPendingActions().then(result => {
        if (result.total > 0) {
          console.log(`📊 Sincronização inicial: ${result.synced}/${result.total} ações sincronizadas`);
        }
      });
    }, 5000); // 5 segundos após inicialização

    // Limpar dados órfãos
    cleanOrphanedOfflineData();

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

  // Função específica para quando estamos dentro do fluxo de uma ordem de serviço
  const handleTabPressInWorkOrder = (tab: 'home' | 'profile') => {
    console.log('🔄 DEBUG: handleTabPressInWorkOrder chamado com tab:', tab);
    console.log('🔄 DEBUG: currentScreen atual:', currentScreen);
    
    setActiveTab(tab);
    if (tab === 'home') {
      // Permitir navegar para home - resetar fluxo da OS e voltar para main
      console.log('🏠 Navegando para home - resetando fluxo da OS');
      setCurrentScreen('main');
      setSelectedWorkOrder(null);
      
      // Forçar atualização da tela principal
      console.log('🔄 Forçando atualização da home...');
      setRefreshMainScreen(prev => prev + 1);
    } else if (tab === 'profile') {
      // Permitir ir para perfil
      console.log('👤 Navegando para perfil');
      setCurrentScreen('profile');
    }
    console.log('🔄 DEBUG: Tab processado');
  };

  const handleBackToMain = () => {
    console.log('🔙 Voltando para tela principal');
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
    
    // NOVO: Forçar atualização sempre que volta para main
    console.log('🔄 Forçando atualização da home ao voltar...');
    setRefreshMainScreen(prev => prev + 1);
  };

  const handleBackFromAudit = () => {
    console.log('🔙 DEBUG: handleBackFromAudit chamado');
    console.log('🔙 DEBUG: currentScreen atual:', currentScreen);
    console.log('🔙 DEBUG: Mudando para steps');
    setCurrentScreen('steps');
    console.log('🔙 DEBUG: setCurrentScreen(steps) executado');
  };

  const handleBackFromPhotoCollection = async () => {
    console.log('🔙 DEBUG: handleBackFromPhotoCollection chamado');
    console.log('🔙 DEBUG: currentScreen atual:', currentScreen);
    
    if (selectedWorkOrder) {
      try {
        // Verificar se já existe foto final
        const { hasFinalPhoto } = await import('./src/services/auditService');
        const { hasPhoto, error } = await hasFinalPhoto(selectedWorkOrder.id);
        
        if (error) {
          console.warn('⚠️ DEBUG: Erro ao verificar foto final, voltando para auditoria:', error);
          console.log('🔙 DEBUG: Mudando para audit (fallback)');
          setCurrentScreen('audit');
          return;
        }

        if (hasPhoto) {
          console.log('✅ DEBUG: Foto final já existe - pulando auditoria e voltando para steps');
          setCurrentScreen('steps');
        } else {
          console.log('📱 DEBUG: Foto final não existe - voltando para auditoria');
          setCurrentScreen('audit');
        }
      } catch (error) {
        console.error('💥 DEBUG: Erro ao verificar foto final:', error);
        console.log('🔙 DEBUG: Mudando para audit (erro)');
        setCurrentScreen('audit');
      }
    } else {
      console.error('❌ DEBUG: selectedWorkOrder é null, voltando para audit');
      setCurrentScreen('audit');
    }
    
    console.log('🔙 DEBUG: handleBackFromPhotoCollection concluído');
  };

  const handleBackFromSteps = () => {
    console.log('🔙 DEBUG: handleBackFromSteps chamado');
    console.log('🔙 DEBUG: currentScreen atual:', currentScreen);
    console.log('🔙 DEBUG: Mudando para workOrderDetail');
    setCurrentScreen('workOrderDetail');
    console.log('🔙 DEBUG: setCurrentScreen(workOrderDetail) executado');
  };

  const handleBackFromStartService = () => {
    console.log('🔙 DEBUG: handleBackFromStartService chamado');
    console.log('🔙 DEBUG: currentScreen atual:', currentScreen);
    console.log('🔙 DEBUG: Mudando para workOrderDetail');
    setCurrentScreen('workOrderDetail');
    console.log('🔙 DEBUG: setCurrentScreen(workOrderDetail) executado');
  };

  const handleOpenWorkOrder = (workOrder: WorkOrder) => {
    setSelectedWorkOrder(workOrder);
    setCurrentScreen('workOrderDetail');
  };

  const handleStartService = async () => {
    if (selectedWorkOrder) {
      // REMOVIDO: Condição de status "em_progresso" (conforme solicitado)
      // Mantida apenas: verificação de foto inicial existente
      
      try {
        // Verificar se já existe foto inicial (online ou offline)
        const { hasInitialPhoto } = await import('./src/services/auditService');
        const { hasPhoto, error } = await hasInitialPhoto(selectedWorkOrder.id);
        
        if (error) {
          console.warn('⚠️ Erro ao verificar foto inicial, indo para tela de início:', error);
          setCurrentScreen('startService');
          return;
        }

        if (hasPhoto) {
          console.log('✅ Foto inicial já existe - pulando tela de foto e indo para etapas');
          // Atualizar status local para em_progresso se ainda não estiver
          if ((selectedWorkOrder.status as string) !== 'em_progresso') {
            await updateLocalWorkOrderStatus(selectedWorkOrder.id, 'em_progresso', false);
            setSelectedWorkOrder({
              ...selectedWorkOrder,
              status: 'em_progresso'
            });
          }
          setCurrentScreen('steps');
        } else {
          console.log('📱 Foto inicial não existe - indo para tela de início');
          setCurrentScreen('startService');
        }
      } catch (error) {
        console.error('💥 Erro ao verificar foto inicial:', error);
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
          console.warn('⚠️ Erro ao verificar foto final, indo para auditoria:', error);
          setCurrentScreen('audit');
          return;
        }

        if (hasPhoto) {
          console.log('✅ Foto final existe - pulando auditoria e indo para coleta de fotos');
          setCurrentScreen('photoCollection');
        } else {
          console.log('📱 Foto final não existe - indo para auditoria');
          setCurrentScreen('audit');
        }
      } catch (error) {
        console.warn('⚠️ Erro ao verificar foto final, indo para auditoria:', error);
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
    // Verificar se deve pular a coleta de fotos
    if (auditData.skipPhotoCollection) {
      console.log('🚀 Pulando coleta de fotos - indo direto para salvamento');
      setCurrentScreen('auditSaving');
    } else {
      // Ir para a tela de coleta de fotos
      setCurrentScreen('photoCollection');
    }
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
        console.log('⏳ Verificando conectividade e finalizando OS...');
        
        // Verificar conectividade
        const NetInfo = require('@react-native-community/netinfo');
        const netInfo = await NetInfo.fetch();
        
        if (netInfo.isConnected) {
          // ONLINE: Sincronizar TODAS as fotos da OS ANTES de finalizar
          console.log('🌐 Online - sincronizando TODAS as fotos da OS antes de finalizar...');
          
          try {
            // NOVA ESTRATÉGIA: Forçar sincronização de TODAS as fotos, não apenas pendentes
            console.log('📸 Forçando sincronização completa de todas as fotos da OS...');
            
            // 1. Buscar e sincronizar fotos de offline_dados_records
            const offlineData = await AsyncStorage.getItem('offline_dados_records');
            let photosSynced = 0;
            let photosErrors: string[] = [];
            
            if (offlineData) {
              const records = JSON.parse(offlineData);
              const workOrderRecords = Object.entries(records).filter(([_, record]: [string, any]) => 
                record.ordem_servico_id === selectedWorkOrder.id
              );
              
              console.log(`📸 Encontradas ${workOrderRecords.length} fotos principais para sincronização forçada`);
              
              // Importar função de sincronização
              const { saveDadosRecord } = await import('./src/services/serviceStepsService');
              
              for (const [recordKey, record] of workOrderRecords) {
                try {
                  const recordData = record as any;
                  console.log(`🔄 Sincronizando foto principal: ${recordKey}`);
                  
                  const { data, error } = await saveDadosRecord(
                    recordData.ordem_servico_id,
                    recordData.entrada_dados_id,
                    recordData.valor
                  );
                  
                  if (!error && data) {
                    console.log(`✅ Foto principal sincronizada: ${recordKey} -> Supabase ID: ${data.id}`);
                    
                    // Marcar como sincronizada
                    records[recordKey].synced = true;
                    records[recordKey].synced_at = new Date().toISOString();
                    records[recordKey].supabase_id = data.id;
                    photosSynced++;
                  } else {
                    console.error(`❌ Erro ao sincronizar foto principal ${recordKey}:`, error);
                    photosErrors.push(`${recordKey}: ${error}`);
                  }
                } catch (syncError) {
                  console.error(`💥 Erro crítico ao sincronizar ${recordKey}:`, syncError);
                  photosErrors.push(`${recordKey}: ${syncError}`);
                }
              }
              
              // Salvar estado atualizado
              if (photosSynced > 0) {
                await AsyncStorage.setItem('offline_dados_records', JSON.stringify(records));
              }
            }
            
            // 2. Buscar e sincronizar fotos extras
            const offlineExtrasData = await AsyncStorage.getItem('offline_fotos_extras');
            if (offlineExtrasData) {
              const extrasRecords = JSON.parse(offlineExtrasData);
              const workOrderExtras = Object.entries(extrasRecords).filter(([_, record]: [string, any]) => 
                record.ordem_servico_id === selectedWorkOrder.id
              );
              
              console.log(`📸 Encontradas ${workOrderExtras.length} fotos extras para sincronização forçada`);
              
              // Importar função de sincronização
              const { saveDadosRecord } = await import('./src/services/serviceStepsService');
              
              for (const [recordKey, record] of workOrderExtras) {
                try {
                  const recordData = record as any;
                  console.log(`🔄 Sincronizando foto extra: ${recordKey}`);
                  
                  const { data, error } = await saveDadosRecord(
                    recordData.ordem_servico_id,
                    null, // entrada_dados_id null para fotos extras
                    recordData.valor
                  );
                  
                  if (!error && data) {
                    console.log(`✅ Foto extra sincronizada: ${recordKey} -> Supabase ID: ${data.id}`);
                    
                    // Marcar como sincronizada
                    extrasRecords[recordKey].synced = true;
                    extrasRecords[recordKey].synced_at = new Date().toISOString();
                    extrasRecords[recordKey].supabase_id = data.id;
                    photosSynced++;
                  } else {
                    console.error(`❌ Erro ao sincronizar foto extra ${recordKey}:`, error);
                    photosErrors.push(`${recordKey}: ${error}`);
                  }
                } catch (syncError) {
                  console.error(`💥 Erro crítico ao sincronizar foto extra ${recordKey}:`, syncError);
                  photosErrors.push(`${recordKey}: ${syncError}`);
                }
              }
              
              // Salvar estado atualizado
              if (workOrderExtras.length > 0) {
                await AsyncStorage.setItem('offline_fotos_extras', JSON.stringify(extrasRecords));
              }
            }
            
            console.log(`📊 Sincronização forçada concluída: ${photosSynced} fotos sincronizadas, ${photosErrors.length} erros`);
            
            // Aguardar um pouco para garantir que todas as sincronizações sejam processadas
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Agora finalizar a OS no servidor
            const { updateWorkOrderStatus } = await import('./src/services/workOrderService');
            const { clearAllLocalDataForWorkOrder } = await import('./src/services/localStatusService');
            const { clearOfflineActionsForWorkOrder } = await import('./src/services/integratedOfflineService');
            
            // 1. Finalizar OS no servidor
            const { error: statusError } = await updateWorkOrderStatus(
              selectedWorkOrder.id.toString(), 
              'finalizada'
            );
            
            if (statusError) {
              console.warn('⚠️ Erro ao finalizar OS online:', statusError);
              // Se falhar online, salvar apenas localmente
              await AsyncStorage.setItem(
                `local_work_order_status_${selectedWorkOrder.id}`,
                JSON.stringify({
                  status: 'finalizada',
                  synced: false,
                  updatedAt: new Date().toISOString(),
                })
              );
            } else {
              console.log('✅ OS finalizada online com sucesso');
              
              // 2. Limpar TODOS os dados locais da OS para remover ícone de sincronização
              await clearAllLocalDataForWorkOrder(selectedWorkOrder.id);
              
              // 3. Limpar especificamente ações offline desta OS (agora que já foram sincronizadas)
              await clearOfflineActionsForWorkOrder(selectedWorkOrder.id);
              
              // 4. Notificar callbacks de OS finalizada para atualizar a UI
              const { notifyOSFinalizadaCallbacks } = await import('./src/services/integratedOfflineService');
              notifyOSFinalizadaCallbacks(selectedWorkOrder.id);
              
              console.log('🧹 Dados locais e ações offline limpas após sincronização - ícone de sincronização removido');
            }
            
          } catch (onlineError) {
            console.error('❌ Erro ao finalizar OS online:', onlineError);
            // Fallback para salvamento local
            await AsyncStorage.setItem(
              `local_work_order_status_${selectedWorkOrder.id}`,
              JSON.stringify({
                status: 'finalizada',
                synced: false,
                updatedAt: new Date().toISOString(),
              })
            );
          }
          
        } else {
          // OFFLINE: Salvar apenas localmente e manter fotos para sincronização posterior
          console.log('📱 Offline - salvando status local e mantendo fotos para sincronização...');
          await AsyncStorage.setItem(
            `local_work_order_status_${selectedWorkOrder.id}`,
            JSON.stringify({
              status: 'finalizada',
              synced: false,
              updatedAt: new Date().toISOString(),
            })
          );
          
          console.log('📸 Fotos mantidas para sincronização quando houver conexão');
        }
        
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
    console.log('📄 Download do relatório solicitado');
  };

  const handleEvaluateOrder = () => {
    console.log('⭐ Navegando para tela de avaliação da ordem de serviço');
    setCurrentScreen('orderEvaluation');
  };

  const handleReopenOrder = () => {
    // TODO: Implementar reabertura da ordem de serviço
    console.log('🔄 Reabertura da ordem de serviço solicitada');
  };

  const handleViewWorkOrders = () => {
    console.log('🔄 Voltando para lista de OSs');
    
    // Voltar para a tela principal e forçar atualização
    setCurrentScreen('main');
    setSelectedWorkOrder(null);
    
    // NOVO: Forçar atualização da home após finalizar OS
    console.log('🔄 Forçando atualização da home após finalizar OS...');
    setRefreshMainScreen(prev => prev + 1);
    
    console.log('✅ Navegação para main concluída com atualização forçada');
  };

  const handleSaveEvaluation = async (evaluationData: any) => {
    try {
      console.log('💾 Salvando avaliação da ordem de serviço...');
      
      const { success, error } = await saveEvaluation(evaluationData);
      
      if (success) {
        Alert.alert(
          'Avaliação Salva',
          'A avaliação da ordem de serviço foi salva com sucesso!',
          [
            {
              text: 'OK',
              onPress: () => {
                // Voltar para a tela de detalhes
                setCurrentScreen('workOrderDetail');
                // Forçar atualização da tela principal para refletir a avaliação
                setRefreshMainScreen(prev => prev + 1);
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Erro ao Salvar',
          error || 'Não foi possível salvar a avaliação. Tente novamente.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao salvar avaliação:', error);
      Alert.alert(
        'Erro',
        'Erro inesperado ao salvar avaliação. Tente novamente.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleBackFromEvaluation = () => {
    console.log('🔙 Voltando da tela de avaliação para detalhes');
    setCurrentScreen('workOrderDetail');
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
    // Regra de negócio atualizada: Gestor e Supervisor veem ManagerScreen, Técnico vê MainScreen
    const funcao = appUser.funcao_original?.toLowerCase() || appUser.userType;
    const isManagerUser = funcao === 'gestor' || funcao === 'supervisor' || appUser.userType === 'gestor';
    
    if (isManagerUser) {
      return <ManagerScreen user={appUser} onTabPress={handleTabPress} onOpenWorkOrder={handleOpenWorkOrder} />;
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
          onTabPress={handleTabPressInWorkOrder}
          onStartService={handleStartService}
          onDownloadReport={handleDownloadReport}
          onEvaluateOrder={handleEvaluateOrder}
          onReopenOrder={handleReopenOrder}
        />
      )}
      {currentScreen === 'orderEvaluation' && selectedWorkOrder && (
        <OrderEvaluationScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackFromEvaluation}
          onSaveEvaluation={handleSaveEvaluation}
        />
      )}
      {currentScreen === 'steps' && selectedWorkOrder && (
        <ServiceStepsScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackFromSteps}
          onTabPress={handleTabPressInWorkOrder}
          onFinishService={handleFinishService}
        />
      )}
      {currentScreen === 'startService' && selectedWorkOrder && (
        <StartServiceScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackFromStartService}
          onTabPress={handleTabPressInWorkOrder}
          onConfirmStart={handleConfirmStart}
        />
      )}
      {currentScreen === 'audit' && selectedWorkOrder && (
        <PostServiceAuditScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackFromAudit}
          onTabPress={handleTabPressInWorkOrder}
          onFinishAudit={handleFinishAudit}
          onBackToServiceSteps={handleBackFromAudit}
          onSkipToPhotoCollection={handleSkipToPhotoCollection}
        />
      )}
      {currentScreen === 'photoCollection' && selectedWorkOrder && (
        <PhotoCollectionScreen
          workOrder={selectedWorkOrder}
          user={appUser}
          onBackPress={handleBackFromPhotoCollection}
          onTabPress={handleTabPressInWorkOrder}
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
          onTabPress={handleTabPressInWorkOrder}
          onDownloadReport={handleDownloadReport}
          onViewWorkOrders={handleViewWorkOrders}
        />
      )}
    </View>
  );
}

export default function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const unsubscribe = startAutoSync();
    
    // INICIALIZAÇÃO CORRIGIDA - NÃO BLOQUEIA O APP
    const initializeAppSystems = async () => {
      try {
        console.log('🚀 Inicializando aplicativo...');
        
        // CRÍTICO: Marcar como pronto IMEDIATAMENTE para app funcionar
        setAppReady(true);
        
        // Inicializar sistemas em background (não blocking)
        setTimeout(async () => {
          try {
            console.log('🔄 Inicializando sistemas em background...');
            
            // 1. Sistema de fotos (em background)
            try {
              const photoResult = await initializePhotoSystem();
              if (photoResult.success) {
                console.log('✅ Sistema de fotos inicializado com sucesso');
              } else {
                console.warn('⚠️ Problema na inicialização do sistema de fotos:', photoResult.message);
              }
            } catch (photoError) {
              console.warn('⚠️ Erro no sistema de fotos (não crítico):', photoError);
            }

            // 2. Dados offline (em background)  
            try {
              console.log('🔄 Inicializando dados offline (FileSystem)...');
              const offlineDataResult = await smartOfflineDataService.ensureOfflineDataAvailable();
              
              if (offlineDataResult.available) {
                console.log('✅ Dados offline disponíveis no FileSystem para funcionamento offline');
                if (!offlineDataResult.fresh) {
                  console.log('⏰ Dados offline não são frescos - serão atualizados em background');
                }
              } else {
                console.warn('⚠️ Dados offline não disponíveis no FileSystem:', offlineDataResult.error);
                console.log('📱 App funcionará apenas online até próxima sincronização');
              }

              // 3. Diagnóstico do sistema offline (em background)
              const diagnostics = await smartOfflineDataService.getOfflineDataDiagnostics();
              console.log('📊 Diagnóstico dos dados offline (FileSystem):', diagnostics.recommendations);
              
            } catch (offlineError) {
              console.warn('⚠️ Erro nos dados offline (não crítico):', offlineError);
              console.log('📱 App funcionará apenas online');
            }

          } catch (backgroundError) {
            console.error('💥 Erro na inicialização em background:', backgroundError);
            // NÃO IMPEDE a app de funcionar - sistemas podem ser inicializados depois
          }
        }, 100); // 100ms delay para não bloquear UI

      } catch (error) {
        console.error('💥 Erro crítico na inicialização:', error);
        // SEMPRE marcar como pronto, mesmo com erro crítico
        setAppReady(true);
      }
    };

    initializeAppSystems();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  if (!appReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066CC" />
      </View>
    );
  }

  // Disponibilizar debug no console global
  if (__DEV__) {
    (global as any).debugSyncStatusForWorkOrder = debugSyncStatusForWorkOrder;
    (global as any).forceSyncPhotosForWorkOrder = forceSyncPhotosForWorkOrder;
    
    // NOVO: Comandos para sistema de dados offline
    (global as any).downloadOfflineData = smartOfflineDataService.downloadOfflineData;
    (global as any).getOfflineDataDiagnostics = smartOfflineDataService.getOfflineDataDiagnostics;
    (global as any).ensureOfflineDataAvailable = smartOfflineDataService.ensureOfflineDataAvailable;
    
    // NOVO: Demonstrar sistema completo
    (global as any).demonstratePhotoSystem = demonstratePhotoSystem;
    
    // NOVO: Comando completo de teste offline
    (global as any).testOfflineMode = async () => {
      console.log('🧪 ===== TESTE COMPLETO MODO OFFLINE =====');
      
      // 1. Verificar dados offline
      const offlineStatus = await smartOfflineDataService.getOfflineDataDiagnostics();
      console.log('📊 Status dados offline:', offlineStatus);
      
      // 2. Verificar sistema de fotos
      const { getPhotoSystemDiagnostics } = await import('./src/services/integratedOfflineService');
      const photoStatus = await getPhotoSystemDiagnostics();
      console.log('📸 Status sistema de fotos:', photoStatus);
      
      // 3. Recomendações
      const allRecommendations = [
        ...offlineStatus.recommendations,
        ...photoStatus.recommendations
      ];
      
      console.log('💡 Recomendações:', allRecommendations);
      
      return {
        offlineData: offlineStatus,
        photoSystem: photoStatus,
        recommendations: allRecommendations,
        ready: offlineStatus.hasEtapas && offlineStatus.hasEntradas
      };
    };
    
    console.log('🔧 Comandos de debug disponíveis:');
    console.log('- global.downloadOfflineData() // Baixar dados offline');
    console.log('- global.getOfflineDataDiagnostics() // Ver status dados offline');
    console.log('- global.testOfflineMode() // Teste completo modo offline');
    console.log('- global.demonstratePhotoSystem() // Demonstrar sistema de fotos');
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <StatusBar style="light" />
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
