import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AuditoriaTecnico, savePhotoInicio, saveAuditoriaFinal } from './auditService';
import { updateWorkOrderStatus } from './workOrderService';
import { markLocalStatusAsSynced } from './localStatusService';

// Tipos para dados offline
export interface OfflineAction {
  id: string;
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'UPDATE_STATUS' | 'ADD_COMMENT' | 'AUDITORIA_FINAL';
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

const OFFLINE_ACTIONS_KEY = 'offline_actions';
const MAX_SYNC_ATTEMPTS = 3;
const SYNC_TIMEOUT = 30000; // 30 segundos timeout por ação

// Sistema de lock para evitar sincronizações simultâneas
let isSyncing = false;
let syncTimeout: NodeJS.Timeout | null = null;

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
    console.log('💾 Ação salva offline:', action.type, action.id);
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
    const updatedActions = actions.map(action => 
      action.id === actionId ? { ...action, synced: true } : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
    console.log('✅ Ação marcada como sincronizada:', actionId);
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
    const unsyncedActions = actions.filter(action => !action.synced);
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(unsyncedActions));
    console.log('🧹 Ações sincronizadas removidas. Restam:', unsyncedActions.length);
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
    console.log('💾 Foto salva offline com sucesso');

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar online...');
      
      const { data, error } = await savePhotoInicio(workOrderId, technicoId, photoUri);
      
      if (!error && data) {
        // Sucesso online - marcar como sincronizado
        await markActionAsSynced(actionId);
        console.log('✅ Foto salva online e marcada como sincronizada');
        return { success: true };
      } else {
        // Falha online - manter offline para sincronização posterior
        console.log('⚠️ Falha ao salvar online, mantendo offline:', error);
        return { success: true, savedOffline: true, error: `Salvo offline: ${error}` };
      }
    } else {
      console.log('📱 Sem conexão, foto salva apenas offline');
      return { success: true, savedOffline: true, error: 'Sem conexão - salvo offline' };
    }

  } catch (error) {
    console.error('💥 Erro ao salvar foto com suporte offline:', error);
    return { success: false, error: 'Erro inesperado ao salvar foto' };
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

      case 'UPDATE_STATUS':
        try {
          const statusPromise = updateWorkOrderStatus(
            action.workOrderId.toString(),
            action.data.newStatus
          );
          
          const { data: statusData, error: statusError } = await withTimeout(statusPromise, SYNC_TIMEOUT);
          
          if (statusError) {
            console.error('❌ Erro ao sincronizar atualização de status:', statusError);
            return false;
          }
          
          // Marcar status local como sincronizado
          await markLocalStatusAsSynced(action.workOrderId);
          
          console.log('✅ Status sincronizado:', action.data.newStatus);
          return true;
        } catch (statusSyncError) {
          console.error('💥 Erro inesperado ao sincronizar status:', statusSyncError);
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
    const actions = await getOfflineActions();
    const pendingActions = actions.filter(action => 
      !action.synced && action.attempts < MAX_SYNC_ATTEMPTS
    );

    console.log(`📊 ${pendingActions.length} ações pendentes para sincronizar`);
    
    if (pendingActions.length === 0) {
      console.log('✅ Nenhuma ação pendente para sincronizar');
      return { total: 0, synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < pendingActions.length; i++) {
      const action = pendingActions[i];
      
      try {
        console.log(`🔄 Sincronizando ${i + 1}/${pendingActions.length}: ${action.type} (${action.id})`);
        
        const actionStartTime = Date.now();
        const success = await syncAction(action);
        const actionDuration = Date.now() - actionStartTime;
        
        if (success) {
          await markActionAsSynced(action.id);
          synced++;
          console.log(`✅ Ação ${i + 1}/${pendingActions.length} sincronizada em ${actionDuration}ms`);
        } else {
          await incrementSyncAttempts(action.id);
          failed++;
          console.log(`❌ Ação ${i + 1}/${pendingActions.length} falhou após ${actionDuration}ms`);
        }
      } catch (actionError) {
        console.error('💥 Erro ao processar ação:', action.id, actionError);
        await incrementSyncAttempts(action.id);
        failed++;
      }
      
      // Verificar se ainda está online a cada ação
      const stillOnline = await checkNetworkConnection();
      if (!stillOnline) {
        console.log('📱 Conexão perdida durante sincronização, parando...');
        break;
      }
    }

    // Limpar ações sincronizadas
    if (synced > 0) {
      await cleanSyncedActions();
    }

    const totalDuration = Date.now() - syncStartTime;
    console.log(`✅ Sincronização concluída em ${totalDuration}ms: ${synced} sucesso, ${failed} falhas`);
    return { total: pendingActions.length, synced, failed };

  } catch (error) {
    console.error('💥 Erro na sincronização:', error);
    return { total: 0, synced: 0, failed: 1 };
  } finally {
    // Liberar lock
    isSyncing = false;
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
      console.log('📶 Online - salvando auditoria final diretamente...');
      const { data, error } = await saveAuditoriaFinal(
        workOrderId, 
        technicoId, 
        photoUri, 
        trabalhoRealizado,
        motivo,
        comentario
      );
      
      if (error) {
        console.log('❌ Erro online, salvando offline como fallback...');
        // Se falhar online, salvar offline como fallback
        await saveAuditoriaFinalToQueue(workOrderId, technicoId, photoUri, trabalhoRealizado, motivo, comentario);
        return { success: true, savedOffline: true };
      }
      
      return { success: true, savedOffline: false };
    } else {
      // Offline: salvar na fila
      console.log('📱 Offline - salvando auditoria final na fila...');
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
  console.log('📱 Auditoria final adicionada à fila offline:', action.id);
};

/**
 * Atualiza status da OS offline se não houver conexão
 */
export const saveStatusUpdateOffline = async (
  workOrderId: number,
  newStatus: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  try {
    // Verificar conexão
    const netInfo = await NetInfo.fetch();
    
    if (netInfo.isConnected) {
      // Online: tentar atualizar diretamente
      console.log('📶 Online - atualizando status diretamente...');
      const { data, error } = await updateWorkOrderStatus(
        workOrderId.toString(), 
        newStatus
      );
      
      if (error) {
        console.log('❌ Erro online, salvando offline como fallback...');
        // Se falhar online, salvar offline como fallback
        await saveStatusUpdateToQueue(workOrderId, newStatus);
        return { success: true, savedOffline: true };
      }
      
      return { success: true, savedOffline: false };
    } else {
      // Offline: salvar na fila
      console.log('📱 Offline - salvando atualização de status na fila...');
      await saveStatusUpdateToQueue(workOrderId, newStatus);
      return { success: true, savedOffline: true };
    }
  } catch (error) {
    console.error('💥 Erro ao atualizar status:', error);
    return { success: false, error: 'Erro inesperado ao atualizar status' };
  }
};

/**
 * Salva atualização de status na fila offline
 */
const saveStatusUpdateToQueue = async (
  workOrderId: number,
  newStatus: string
) => {
  const action: OfflineAction = {
    id: `status_update_${workOrderId}_${Date.now()}`,
    type: 'UPDATE_STATUS',
    timestamp: new Date().toISOString(),
    workOrderId,
    technicoId: '', // Não precisa de técnico para atualizar status
    data: {
      newStatus,
    },
    synced: false,
    attempts: 0,
  };

  await saveOfflineAction(action);
  console.log('📱 Atualização de status adicionada à fila offline:', action.id);
};

/**
 * Obtém estatísticas das ações offline
 */
export const getSyncStats = async (): Promise<{
  total: number;
  pending: number;
  synced: number;
  failed: number;
}> => {
  try {
    const actions = await getOfflineActions();
    const pending = actions.filter(a => !a.synced && a.attempts < MAX_SYNC_ATTEMPTS).length;
    const synced = actions.filter(a => a.synced).length;
    const failed = actions.filter(a => !a.synced && a.attempts >= MAX_SYNC_ATTEMPTS).length;
    
    return {
      total: actions.length,
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