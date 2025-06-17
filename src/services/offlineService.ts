import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AuditoriaTecnico, savePhotoInicio, saveAuditoriaFinal } from './auditService';
import { markLocalStatusAsSynced, clearAllLocalDataForWorkOrder } from './localStatusService';
import { saveDadosRecord, saveComentarioEtapa } from './serviceStepsService';

// Tipos para dados offline
export interface OfflineAction {
  id: string;
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'AUDITORIA_FINAL' | 'DADOS_RECORD' | 'COMENTARIO_ETAPA' | 'CHECKLIST_ETAPA';
  timestamp: string;
  workOrderId: number;
  technicoId: string;
  data: any;
  synced: boolean;
  attempts: number;
}

export interface OfflinePhotoAction extends OfflineAction {
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL';
  data: {
    photoUri: string;
    base64?: string;
    motivo?: string;
  };
}

// Variáveis globais para controle
let isSyncing = false;
let syncTimeout: NodeJS.Timeout | null = null;
let autoSyncInterval: NodeJS.Timeout | null = null;
let remainingActionsCount = 0; // Contador dinâmico para sincronização

// Callback para notificar a UI sobre mudanças de sincronização
let syncCallbacks: Array<(result: { total: number; synced: number; failed: number }) => void> = [];

// Callback para notificar quando uma OS é finalizada online
let osFinalizadaCallbacks: Array<(workOrderId: number) => void> = [];

// Constantes
const OFFLINE_ACTIONS_KEY = 'offline_actions';
const MAX_SYNC_ATTEMPTS = 3;
const SYNC_TIMEOUT = 30000; // 30 segundos timeout por ação

/**
 * Verifica se há conexão com a internet
 */
export const checkNetworkConnection = async (): Promise<boolean> => {
  try {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected === true && netInfo.isInternetReachable === true;
  } catch (error) {
    console.log('⚠️ Erro ao verificar conexão:', error);
    return false;
  }
};

/**
 * Verifica se está sincronizando no momento
 */
export const isSyncInProgress = (): boolean => {
  return isSyncing;
};

/**
 * Obtém o número de ações restantes durante a sincronização
 */
export const getRemainingActionsCount = (): number => {
  return remainingActionsCount;
};

/**
 * Força parada da sincronização (em caso de travamento)
 */
export const forceStopSync = (): void => {
  console.log('🛑 Forçando parada da sincronização...');
  isSyncing = false;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
};

/**
 * Executa uma função com timeout
 */
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout na operação')), timeoutMs)
    )
  ]);
};

/**
 * Salva ação offline no AsyncStorage
 */
const saveOfflineAction = async (action: OfflineAction): Promise<void> => {
  try {
    const existingActions = await getOfflineActions();
    const updatedActions = [...existingActions, action];
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
  } catch (error) {
    console.error('❌ Erro ao salvar ação offline:', error);
  }
};

/**
 * Recupera todas as ações offline
 */
export const getOfflineActions = async (): Promise<OfflineAction[]> => {
  try {
    const actionsJson = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
    return actionsJson ? JSON.parse(actionsJson) : [];
  } catch (error) {
    console.error('❌ Erro ao recuperar ações offline:', error);
    return [];
  }
};

/**
 * Marca ação como sincronizada
 */
const markActionAsSynced = async (actionId: string): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const actionToSync = actions.find(action => action.id === actionId);
    if (!actionToSync) {
      console.error(`❌ Ação não encontrada para marcar como sincronizada: ${actionId}`);
      return;
    }
    
    const updatedActions = actions.map(action => 
      action.id === actionId ? { ...action, synced: true } : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
    console.log(`✅ Ação ${actionToSync.type} marcada como sincronizada`);
    
  } catch (error) {
    console.error('❌ Erro ao marcar ação como sincronizada:', error);
  }
};

/**
 * Remove ações já sincronizadas
 */
export const cleanSyncedActions = async (): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const syncedActions = actions.filter(action => action.synced);
    const unsyncedActions = actions.filter(action => !action.synced);
    
    if (syncedActions.length > 0) {
      console.log(`🧹 Removendo ${syncedActions.length} ações sincronizadas`);
      await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(unsyncedActions));
    }
    
  } catch (error) {
    console.error('❌ Erro ao limpar ações sincronizadas:', error);
  }
};

/**
 * Incrementa tentativas de sincronização
 */
const incrementSyncAttempts = async (actionId: string): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const updatedActions = actions.map(action => 
      action.id === actionId ? { ...action, attempts: action.attempts + 1 } : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
  } catch (error) {
    console.error('❌ Erro ao incrementar tentativas:', error);
  }
};

/**
 * Salva foto de início com suporte offline
 */
export const savePhotoInicioOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `photo_inicio_${workOrderId}_${technicoId}_${Date.now()}`;
  
  try {
    // 1. Sempre salvar offline primeiro
    const offlineAction: OfflinePhotoAction = {
      id: actionId,
      type: 'PHOTO_INICIO',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        photoUri,
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      const { data, error } = await savePhotoInicio(workOrderId, technicoId, photoUri);
      
      if (!error && data) {
        // Sucesso online - marcar como sincronizado
        await markActionAsSynced(actionId);
        
        // Limpar apenas o status local para foto de início (não todos os dados)
        // pois a OS ainda pode estar em progresso
        await markLocalStatusAsSynced(workOrderId);
        
        return { success: true };
      } else {
        // Falha online - manter offline para sincronização posterior
        return { success: true, savedOffline: true, error: `Salvo offline: ${error}` };
      }
    } else {
      return { success: true, savedOffline: true, error: 'Sem conexão - salvo offline' };
    }

  } catch (error) {
    return { success: false, error: 'Erro inesperado ao salvar foto' };
  }
};

/**
 * Salva foto final com suporte offline
 */
export const savePhotoFinalOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `photo_final_${workOrderId}_${technicoId}_${Date.now()}`;
  
  try {
    // 1. Verificar conexão primeiro
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar foto final online...');
      
      try {
        // Tentar salvar online direto
        const { saveAuditoriaFinal } = await import('./auditService');
        
        const { data: auditData, error: auditError } = await saveAuditoriaFinal(
          workOrderId,
          technicoId,
          photoUri,
          true, // trabalhoRealizado
          '', // motivo
          '' // comentario
        );
        
        if (!auditError && auditData) {
          console.log('✅ Foto final salva online com sucesso:', auditData.id);
          return { success: true, savedOffline: false };
        } else {
          console.warn('⚠️ Falha ao salvar online, salvando offline...', auditError);
          // Se falhar online, salvar offline
        }
      } catch (onlineError) {
        console.warn('⚠️ Erro ao tentar salvar online, salvando offline...', onlineError);
        // Se der erro online, salvar offline
      }
    }

    // 2. Salvar offline (seja por estar offline ou falha online)
    const offlineAction: OfflinePhotoAction = {
      id: actionId,
      type: 'PHOTO_FINAL',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        photoUri,
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);
    console.log('📱 Foto final salva offline para sincronização posterior');
    
    return { 
      success: true, 
      savedOffline: true, 
      error: isOnline ? 'Salvo offline após falha online' : 'Salvo offline - sem conexão' 
    };

  } catch (error) {
    console.error('💥 Erro inesperado ao salvar foto final:', error);
    return { success: false, error: 'Erro inesperado ao salvar foto final' };
  }
};

/**
 * Sincroniza uma ação específica
 */
const syncAction = async (action: OfflineAction): Promise<boolean> => {
  try {
    console.log(`🔄 Sincronizando ação ${action.type}:`, action.id);
    
    switch (action.type) {
      case 'PHOTO_INICIO':
        try {
          const photoPromise = savePhotoInicio(
            action.workOrderId,
            action.technicoId,
            action.data.photoUri
          );
          
          const { data: photoData, error: photoError } = await withTimeout(photoPromise, SYNC_TIMEOUT);
          
          if (photoError) {
            console.error('❌ Erro ao sincronizar foto inicial:', photoError);
            return false;
          }
          
          console.log('✅ Foto inicial sincronizada:', photoData?.id);
          return true;
        } catch (photoSyncError) {
          console.error('💥 Erro inesperado ao sincronizar foto inicial:', photoSyncError);
          return false;
        }

      case 'PHOTO_FINAL':
        try {
          // Para foto final, precisamos atualizar o registro existente de auditoria
          const { saveAuditoriaFinal } = await import('./auditService');
          
          const finalAuditPromise = saveAuditoriaFinal(
            action.workOrderId,
            action.technicoId,
            action.data.photoUri,
            true, // trabalhoRealizado
            '', // motivo
            '' // comentario
          );
          
          const { data: auditData, error: auditError } = await withTimeout(finalAuditPromise, SYNC_TIMEOUT);
          
          if (auditError) {
            console.error('❌ Erro ao sincronizar foto final:', auditError);
            return false;
          }
          
          console.log('✅ Foto final sincronizada:', auditData?.id);
          return true;
        } catch (photoFinalSyncError) {
          console.error('💥 Erro inesperado ao sincronizar foto final:', photoFinalSyncError);
          return false;
        }

      case 'AUDITORIA_FINAL':
        try {
          const auditPromise = saveAuditoriaFinal(
            action.workOrderId,
            action.technicoId,
            action.data.photoUri,
            action.data.trabalhoRealizado,
            action.data.motivo,
            action.data.comentario
          );
          
          const { data: auditData, error: auditError } = await withTimeout(auditPromise, SYNC_TIMEOUT);
          
          if (auditError) {
            console.error('❌ Erro ao sincronizar auditoria final:', auditError);
            return false;
          }
          
          console.log('✅ Auditoria final sincronizada:', auditData?.id);
          return true;
        } catch (auditSyncError) {
          console.error('💥 Erro inesperado ao sincronizar auditoria final:', auditSyncError);
          return false;
        }

      case 'DADOS_RECORD':
        try {
          const dadosPromise = saveDadosRecord(
            action.workOrderId,
            action.data.entradaDadosId,
            action.data.photoUri
          );
          
          const { data: dadosData, error: dadosError } = await withTimeout(dadosPromise, SYNC_TIMEOUT);
          
          if (dadosError) {
            console.error('❌ Erro ao sincronizar dados da coleta:', dadosError);
            return false;
          }
          
          console.log('✅ Dados da coleta sincronizados:', dadosData?.id);
          return true;
        } catch (dadosSyncError) {
          console.error('💥 Erro inesperado ao sincronizar dados da coleta:', dadosSyncError);
          return false;
        }

      case 'COMENTARIO_ETAPA':
        try {
          const comentarioPromise = saveComentarioEtapa(
            action.workOrderId,
            action.data.etapaId,
            action.data.comentario
          );
          
          const { data: comentarioData, error: comentarioError } = await withTimeout(comentarioPromise, SYNC_TIMEOUT);
          
          if (comentarioError) {
            console.error('❌ Erro ao sincronizar comentário da etapa:', comentarioError);
            return false;
          }
          
          console.log('✅ Comentário da etapa sincronizado:', comentarioData?.id);
          return true;
        } catch (comentarioSyncError) {
          console.error('💥 Erro inesperado ao sincronizar comentário da etapa:', comentarioSyncError);
          return false;
        }

      case 'CHECKLIST_ETAPA':
        try {
          // Por enquanto, apenas marcar como sincronizado
          // TODO: Implementar lógica específica para salvar checklist no servidor
          console.log('📋 Sincronização de checklist ainda não implementada completamente - marcando como sincronizado');
          return true;
        } catch (checklistSyncError) {
          console.error('💥 Erro inesperado ao sincronizar checklist:', checklistSyncError);
          return false;
        }

      default:
        console.log('⚠️ Tipo de ação não implementado:', action.type);
        return false;
    }
  } catch (error) {
    console.error('💥 Erro ao sincronizar ação:', error);
    return false;
  }
};

/**
 * Sincroniza status locais das OS que foram alterados offline
 */
const syncLocalWorkOrderStatuses = async (): Promise<{ synced: number; failed: number }> => {
  try {
    const { getLocalWorkOrderStatuses } = await import('./localStatusService');
    const { updateWorkOrderStatus } = await import('./workOrderService');
    const { markLocalStatusAsSynced } = await import('./localStatusService');
    
    const localStatuses = await getLocalWorkOrderStatuses();
    
    let synced = 0;
    let failed = 0;
    
    // Buscar apenas status não sincronizados
    const unsyncedStatuses = Object.entries(localStatuses).filter(
      ([_, statusData]) => !statusData.synced
    );
    
    if (unsyncedStatuses.length === 0) {
      console.log('✅ Nenhum status local para sincronizar');
      return { synced: 0, failed: 0 };
    }
    
    console.log(`🔄 Sincronizando ${unsyncedStatuses.length} status locais...`);
    
    for (const [workOrderId, statusData] of unsyncedStatuses) {
      try {
        console.log(`🔄 Sincronizando status da OS ${workOrderId}: ${statusData.status}`);
        
        // Mapear status local para status da aplicação
        let appStatus: 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada';
        switch (statusData.status) {
          case 'aguardando':
            appStatus = 'aguardando';
            break;
          case 'em_progresso':
            appStatus = 'em_progresso';
            break;
          case 'finalizada':
            appStatus = 'finalizada';
            break;
          case 'cancelada':
            appStatus = 'cancelada';
            break;
          default:
            console.warn(`⚠️ Status local desconhecido: ${statusData.status}`);
            continue;
        }
        
        // Tentar atualizar no servidor
        const { error } = await updateWorkOrderStatus(workOrderId, appStatus);
        
        if (error) {
          console.error(`❌ Erro ao sincronizar status da OS ${workOrderId}:`, error);
          failed++;
        } else {
          console.log(`✅ Status da OS ${workOrderId} sincronizado: ${appStatus}`);
          
          // Marcar como sincronizado (remove do AsyncStorage)
          await markLocalStatusAsSynced(parseInt(workOrderId));
          synced++;
          
          // Se foi finalizada, notificar callbacks
          if (appStatus === 'finalizada') {
            notifyOSFinalizadaCallbacks(parseInt(workOrderId));
          }
        }
        
      } catch (error) {
        console.error(`💥 Erro ao processar status da OS ${workOrderId}:`, error);
        failed++;
      }
    }
    
    console.log(`✅ Sincronização de status locais: ${synced} sucesso, ${failed} falhas`);
    return { synced, failed };
    
  } catch (error) {
    console.error('💥 Erro na sincronização de status locais:', error);
    return { synced: 0, failed: 0 };
  }
};

/**
 * Sincroniza todas as ações pendentes
 */
export const syncAllPendingActions = async (): Promise<{ 
  total: number; 
  synced: number; 
  failed: number; 
}> => {
  // Verificar se já está sincronizando
  if (isSyncing) {
    console.log('⏳ Sincronização já em andamento, pulando...');
    return { total: 0, synced: 0, failed: 0 };
  }

  console.log('🔄 Iniciando sincronização de ações pendentes...');

  const isOnline = await checkNetworkConnection();
  if (!isOnline) {
    console.log('📱 Sem conexão, pulando sincronização');
    return { total: 0, synced: 0, failed: 0 };
  }

  // Definir lock
  isSyncing = true;
  const syncStartTime = Date.now();

  try {
    // PRIMEIRO: Sincronizar status locais das OS
    console.log('🎯 Iniciando sincronização de status locais...');
    const statusSyncResult = await syncLocalWorkOrderStatuses();
    console.log(`📊 Status locais: ${statusSyncResult.synced} sincronizados, ${statusSyncResult.failed} falharam`);

    // SEGUNDO: Sincronizar ações offline (fotos, auditorias, etc.)
    const actions = await getOfflineActions();
    const pendingActions = actions.filter(action => 
      !action.synced && action.attempts < MAX_SYNC_ATTEMPTS
    );

    // Agrupar ações pendentes por workOrderId
    const actionsByWorkOrder = pendingActions.reduce((acc, action) => {
      const key = action.workOrderId.toString();
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(action);
      return acc;
    }, {} as { [workOrderId: string]: OfflineAction[] });

    const totalOSs = Object.keys(actionsByWorkOrder).length;
    const totalStatusSynced = statusSyncResult.synced;
    const totalToSync = totalOSs + totalStatusSynced;
    
    console.log(`📊 ${pendingActions.length} ações de ${totalOSs} OSs + ${totalStatusSynced} status pendentes para sincronizar`);
    remainingActionsCount = totalToSync;
    
    if (totalToSync === 0) {
      console.log('✅ Nenhuma pendência para sincronizar');
      remainingActionsCount = 0;
      return { total: 0, synced: 0, failed: 0 };
    }

    let synced = statusSyncResult.synced; // Começar com os status já sincronizados
    let failed = statusSyncResult.failed;
    let processedOSs = 0;

    // Processar ações agrupadas por OS
    for (const [workOrderId, osActions] of Object.entries(actionsByWorkOrder)) {
      try {
        console.log(`🔄 Sincronizando OS ${workOrderId} (${osActions.length} ações)`);
        
        let osSuccess = true;
        
        // Sincronizar todas as ações desta OS
        for (const action of osActions) {
          try {
            const actionStartTime = Date.now();
            const success = await syncAction(action);
            const actionDuration = Date.now() - actionStartTime;
            
            if (success) {
              await markActionAsSynced(action.id);
              console.log(`✅ Ação ${action.type} da OS ${workOrderId} sincronizada em ${actionDuration}ms`);
            } else {
              await incrementSyncAttempts(action.id);
              osSuccess = false;
              console.log(`❌ Ação ${action.type} da OS ${workOrderId} falhou após ${actionDuration}ms`);
            }
          } catch (actionError) {
            console.error('💥 Erro ao processar ação:', action.id, actionError);
            await incrementSyncAttempts(action.id);
            osSuccess = false;
          }
        }
        
        // Contar resultado da OS
        if (osSuccess) {
          synced++;
          console.log(`✅ OS ${workOrderId} sincronizada completamente`);
          
          // Limpar TODOS os dados locais da OS sincronizada (não apenas status)
          await clearAllLocalDataForWorkOrder(parseInt(workOrderId));
          
          // Notificar callbacks de OS finalizada para atualizar a UI
          notifyOSFinalizadaCallbacks(parseInt(workOrderId));
        } else {
          failed++;
          console.log(`❌ OS ${workOrderId} teve falhas na sincronização`);
        }
        
        processedOSs++;
        // Atualizar contador de OSs restantes (incluindo status já sincronizados)
        remainingActionsCount = totalToSync - statusSyncResult.synced - processedOSs;
        
      } catch (osError) {
        console.error('💥 Erro ao processar OS:', workOrderId, osError);
        failed++;
        processedOSs++;
        remainingActionsCount = totalToSync - statusSyncResult.synced - processedOSs;
      }
      
      // Verificar se ainda está online a cada OS
      const stillOnline = await checkNetworkConnection();
      if (!stillOnline) {
        console.log('📱 Conexão perdida durante sincronização, parando...');
        break;
      }
    }

    // Limpar ações sincronizadas
    if (synced > statusSyncResult.synced) {
      await cleanSyncedActions();
    }

    const totalDuration = Date.now() - syncStartTime;
    const result = { total: totalToSync, synced, failed };
    
    console.log(`✅ Sincronização concluída: ${synced}/${totalToSync} itens sincronizados (${statusSyncResult.synced} status + ${synced - statusSyncResult.synced} OSs)`);
    
    // Notificar callbacks se houve alguma sincronização
    if (synced > 0) {
      notifySyncCallbacks(result);
    }
    
    return result;

  } catch (error) {
    console.error('💥 Erro na sincronização:', error);
    return { total: 0, synced: 0, failed: 1 };
  } finally {
    // Liberar lock e zerar contador
    isSyncing = false;
    remainingActionsCount = 0;
    console.log('🔓 Lock de sincronização liberado');
  }
};

/**
 * Sincronização com debounce para evitar chamadas múltiplas
 */
const debouncedSync = () => {
  // Cancelar timeout anterior se existir
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Agendar nova sincronização
  syncTimeout = setTimeout(() => {
    syncAllPendingActions();
    syncTimeout = null;
  }, 3000); // 3 segundos de debounce
};

/**
 * Monitora conexão e sincroniza automaticamente
 */
export const startAutoSync = (): (() => void) => {
  console.log('🔄 Iniciando monitoramento automático de sincronização');

  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('🌐 Conexão restaurada, agendando sincronização automática...');
      debouncedSync();
    }
  });

  return unsubscribe;
};

/**
 * Salva auditoria final offline se não houver conexão
 */
export const saveAuditoriaFinalOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string,
  trabalhoRealizado: boolean,
  motivo?: string,
  comentario?: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  try {
    // Verificar conexão
    const netInfo = await NetInfo.fetch();
    
    if (netInfo.isConnected) {
      // Online: tentar salvar diretamente
      console.log('🌐 Tentando salvar auditoria final online...');
      const { data, error } = await saveAuditoriaFinal(
        workOrderId, 
        technicoId, 
        photoUri, 
        trabalhoRealizado,
        motivo,
        comentario
      );
      
      if (error) {
        // Se falhar online, salvar offline como fallback
        console.log('⚠️ Falha ao salvar online, salvando offline como fallback');
        await saveAuditoriaFinalToQueue(workOrderId, technicoId, photoUri, trabalhoRealizado, motivo, comentario);
        return { success: true, savedOffline: true };
      }
      
      // ✅ Sucesso online: limpar TODOS os dados locais e ações offline
      console.log('✅ Auditoria salva online com sucesso - limpando dados locais');
      
      // Limpar dados locais (status, etapas, fotos, etc.)
      const { clearAllLocalDataForWorkOrder } = await import('./localStatusService');
      await clearAllLocalDataForWorkOrder(workOrderId);
      
      // Limpar especificamente ações offline desta OS para evitar "1 pendente"
      await clearOfflineActionsForWorkOrder(workOrderId);
      
      // Notificar callbacks de OS finalizada para atualizar a UI
      notifyOSFinalizadaCallbacks(workOrderId);
      
      console.log('🧹 Dados locais e ações offline limpas - ícone de sincronização removido');
      
      return { success: true, savedOffline: false };
    } else {
      // Offline: salvar na fila
      console.log('📱 Offline - salvando auditoria na fila para sincronização');
      await saveAuditoriaFinalToQueue(workOrderId, technicoId, photoUri, trabalhoRealizado, motivo, comentario);
      return { success: true, savedOffline: true };
    }
  } catch (error) {
    console.error('💥 Erro ao salvar auditoria final:', error);
    return { success: false, error: 'Erro inesperado ao salvar auditoria final' };
  }
};

/**
 * Salva auditoria final na fila offline
 */
const saveAuditoriaFinalToQueue = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string,
  trabalhoRealizado: boolean,
  motivo?: string,
  comentario?: string
) => {
  const action: OfflineAction = {
    id: `auditoria_final_${workOrderId}_${Date.now()}`,
    type: 'AUDITORIA_FINAL',
    timestamp: new Date().toISOString(),
    workOrderId,
    technicoId,
    data: {
      photoUri,
      trabalhoRealizado,
      motivo,
      comentario,
    },
    synced: false,
    attempts: 0,
  };

  await saveOfflineAction(action);
};

/**
 * Obtém estatísticas das ações offline agrupadas por OS
 */
export const getSyncStats = async (): Promise<{
  total: number;
  pending: number;
  synced: number;
  failed: number;
}> => {
  try {
    const actions = await getOfflineActions();
    
    // Agrupar ações por workOrderId para contar apenas 1 por OS
    const actionsByWorkOrder = actions.reduce((acc, action) => {
      const key = action.workOrderId.toString();
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(action);
      return acc;
    }, {} as { [workOrderId: string]: OfflineAction[] });
    
    let pending = 0;
    let synced = 0;
    let failed = 0;
    
    // Para cada OS, verificar o status geral das suas ações
    Object.values(actionsByWorkOrder).forEach(osActions => {
      const hasPending = osActions.some(a => !a.synced && a.attempts < MAX_SYNC_ATTEMPTS);
      const allSynced = osActions.every(a => a.synced);
      const hasFailed = osActions.some(a => !a.synced && a.attempts >= MAX_SYNC_ATTEMPTS);
      
      if (hasPending) {
        pending++;
      } else if (allSynced) {
        synced++;
      } else if (hasFailed) {
        failed++;
      }
    });
    
    const totalOSs = Object.keys(actionsByWorkOrder).length;
    
    return {
      total: totalOSs,
      pending,
      synced,
      failed
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    return { total: 0, pending: 0, synced: 0, failed: 0 };
  }
};

/**
 * Remove ações que falharam definitivamente
 */
export const clearFailedActions = async (): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const validActions = actions.filter(action => 
      action.synced || action.attempts < MAX_SYNC_ATTEMPTS
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(validActions));
    console.log('🧹 Ações que falharam foram removidas');
  } catch (error) {
    console.error('❌ Erro ao limpar ações que falharam:', error);
  }
};

/**
 * Reseta tentativas de ações que falharam para tentar novamente
 */
export const retryFailedActions = async (): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const updatedActions = actions.map(action => 
      action.attempts >= MAX_SYNC_ATTEMPTS 
        ? { ...action, attempts: 0 } // Reset tentativas
        : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
    console.log('🔄 Tentativas de ações que falharam foram resetadas');
  } catch (error) {
    console.error('❌ Erro ao resetar tentativas:', error);
  }
};

/**
 * Limpa todas as ações offline (usar com cuidado)
 */
export const clearAllOfflineActions = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(OFFLINE_ACTIONS_KEY);
    console.log('🧹 Todas as ações offline foram removidas');
  } catch (error) {
    console.error('❌ Erro ao limpar todas as ações:', error);
  }
};

/**
 * Remove ações offline específicas de uma OS finalizada online
 */
export const clearOfflineActionsForWorkOrder = async (workOrderId: number): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    
    // Filtrar ações que NÃO são da OS finalizada
    const remainingActions = actions.filter(action => action.workOrderId !== workOrderId);
    
    // Salvar apenas as ações restantes
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(remainingActions));
    
    const removedCount = actions.length - remainingActions.length;
    if (removedCount > 0) {
      console.log(`🧹 Removidas ${removedCount} ações offline da OS ${workOrderId}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao limpar ações offline da OS ${workOrderId}:`, error);
  }
};

/**
 * Registra um callback para ser chamado quando uma OS é finalizada online
 */
export const registerOSFinalizadaCallback = (callback: (workOrderId: number) => void): () => void => {
  osFinalizadaCallbacks.push(callback);
  
  // Retorna função para remover o callback
  return () => {
    osFinalizadaCallbacks = osFinalizadaCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Notifica todos os callbacks registrados sobre uma OS finalizada online
 */
export const notifyOSFinalizadaCallbacks = (workOrderId: number) => {
  console.log(`🔔 Notificando callbacks sobre OS ${workOrderId} finalizada online...`);
  osFinalizadaCallbacks.forEach(callback => {
    try {
      callback(workOrderId);
    } catch (error) {
      console.error('❌ Erro ao executar callback de OS finalizada:', error);
    }
  });
};

/**
 * Registra um callback para ser chamado quando a sincronização automática terminar
 */
export const registerSyncCallback = (callback: (result: { total: number; synced: number; failed: number }) => void): () => void => {
  syncCallbacks.push(callback);
  
  // Retorna função para remover o callback
  return () => {
    syncCallbacks = syncCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Notifica todos os callbacks registrados sobre o resultado da sincronização
 */
const notifySyncCallbacks = (result: { total: number; synced: number; failed: number }) => {
  syncCallbacks.forEach(callback => {
    try {
      callback(result);
    } catch (error) {
      console.error('❌ Erro ao executar callback de sincronização:', error);
    }
  });
};

/**
 * Salva dados da coleta (fotos) com suporte offline
 */
export const saveDadosRecordOffline = async (
  workOrderId: number,
  technicoId: string,
  entradaDadosId: number,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `dados_record_${workOrderId}_${entradaDadosId}_${Date.now()}`;
  
  try {
    // 1. Sempre salvar offline primeiro
    const offlineAction: OfflineAction = {
      id: actionId,
      type: 'DADOS_RECORD',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        entradaDadosId,
        photoUri,
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar dados da coleta online...');
      
      const { data, error } = await saveDadosRecord(workOrderId, entradaDadosId, photoUri);
      
      if (!error && data) {
        // Sucesso online - marcar como sincronizado
        await markActionAsSynced(actionId);
        return { success: true };
      } else {
        // Falha online - manter offline para sincronização posterior
        return { success: true, savedOffline: true, error: `Salvo offline: ${error}` };
      }
    } else {
      return { success: true, savedOffline: true, error: 'Sem conexão - salvo offline' };
    }

  } catch (error) {
    return { success: false, error: 'Erro inesperado ao salvar dados da coleta' };
  }
};

/**
 * Salva comentário da etapa com suporte offline
 */
export const saveComentarioEtapaOffline = async (
  workOrderId: number,
  technicoId: string,
  etapaId: number,
  comentario: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `comentario_etapa_${workOrderId}_${etapaId}_${Date.now()}`;
  
  try {
    // 1. Sempre salvar offline primeiro
    const offlineAction: OfflineAction = {
      id: actionId,
      type: 'COMENTARIO_ETAPA',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        etapaId,
        comentario,
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar comentário online...');
      
      const { data, error } = await saveComentarioEtapa(workOrderId, etapaId, comentario);
      
      if (!error && data) {
        // Sucesso online - marcar como sincronizado  
        await markActionAsSynced(actionId);
        return { success: true };
      } else {
        // Falha online - manter offline para sincronização posterior
        return { success: true, savedOffline: true, error: `Salvo offline: ${error}` };
      }
    } else {
      return { success: true, savedOffline: true, error: 'Sem conexão - salvo offline' };
    }

  } catch (error) {
    return { success: false, error: 'Erro inesperado ao salvar comentário' };
  }
};

/**
 * Salva dados de checklist de etapa com suporte offline
 */
export const saveChecklistEtapaOffline = async (
  workOrderId: number,
  technicoId: string,
  checklistData: { [entryId: number]: boolean }
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `checklist_etapa_${workOrderId}_${Date.now()}`;
  
  try {
    // 1. Sempre salvar offline primeiro
    const offlineAction: OfflineAction = {
      id: actionId,
      type: 'CHECKLIST_ETAPA',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        checklistData,
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar checklist online...');
      
      // Por enquanto, apenas salvar offline - implementar sincronização quando necessário
      return { success: true, savedOffline: true, error: 'Checklist salvo offline para sincronização' };
    } else {
      return { success: true, savedOffline: true, error: 'Sem conexão - checklist salvo offline' };
    }

  } catch (error) {
    return { success: false, error: 'Erro inesperado ao salvar checklist' };
  }
}; 