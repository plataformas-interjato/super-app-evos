import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import unifiedOfflineDataService from './unifiedOfflineDataService';

// INTERFACES MANTIDAS PARA COMPATIBILIDADE
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
    photoId?: string;
    base64?: string;
    motivo?: string;
  };
}

// ESTADO DA SINCRONIZAÇÃO
let isSyncing = false;
let syncTimeout: NodeJS.Timeout | null = null;

// CALLBACKS
let syncCallbacks: Array<(result: { total: number; synced: number; failed: number }) => void> = [];
let osFinalizadaCallbacks: Array<(workOrderId: number) => void> = [];

/**
 * Verifica conexão de rede
 */
export const checkNetworkConnection = async (): Promise<boolean> => {
  try {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected === true && netInfo.isInternetReachable === true;
  } catch (error) {
    return false;
  }
};

/**
 * Verifica se sincronização está em progresso
 */
export const isSyncInProgress = (): boolean => {
  return isSyncing;
};

/**
 * Força parada da sincronização
 */
export const forceStopSync = (): void => {
  isSyncing = false;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
};

/**
 * Conta ações pendentes (sempre 0 no sistema unificado)
 */
export const getRemainingActionsCount = (): number => {
  return 0;
};

/**
 * MIGRADO: Recupera ações offline (sistema unificado gerencia por OS)
 */
export const getOfflineActions = async (): Promise<OfflineAction[]> => {
  return [];
};

/**
 * Sincroniza todas as ações pendentes
 */
export const syncAllPendingActions = async (): Promise<{ 
  total: number; 
  synced: number; 
  errors: string[] 
}> => {
  if (isSyncing) {
    return { total: 0, synced: 0, errors: [] };
  }

  const isOnline = await checkNetworkConnection();
  if (!isOnline) {
    return { total: 0, synced: 0, errors: [] };
  }

  isSyncing = true;

  try {
    let synced = 0;
    const errors: string[] = [];

    // Sincronizar sistema unificado (FileSystem)
    try {
      const { synced: unifiedSynced, errors: unifiedErrors } = await unifiedOfflineDataService.syncPendingActions();
      synced += unifiedSynced;
      errors.push(...unifiedErrors);
    } catch (unifiedError) {
      errors.push(`Erro ao sincronizar sistema unificado: ${unifiedError instanceof Error ? unifiedError.message : String(unifiedError)}`);
    }

    // NOVO: Sincronizar status locais finalizados (AsyncStorage) para compatibilidade
    try {
      const { getLocalWorkOrderStatuses, markLocalStatusAsSynced } = await import('./localStatusService');
      const { updateWorkOrderStatus } = await import('./workOrderService');
      const statuses = await getLocalWorkOrderStatuses();
      const entries = Object.entries(statuses);
      for (const [woId, st] of entries) {
        if (st.status === 'finalizada' && st.synced === false) {
          const { error } = await updateWorkOrderStatus(woId, 'finalizada');
          if (!error) {
            await markLocalStatusAsSynced(Number(woId));
            synced += 1;
          } else {
            errors.push(`Falha ao sincronizar status da OS ${woId}: ${error}`);
          }
        }
      }
    } catch (statusSyncError) {
      errors.push(`Erro ao sincronizar status locais: ${statusSyncError instanceof Error ? statusSyncError.message : String(statusSyncError)}`);
    }

    // Notificar callbacks se houve sincronização
    if (synced > 0) {
      notifySyncCallbacks({ total: synced, synced, failed: errors.length });
    }

    return { total: synced, synced, errors };
  } catch (error) {
    return { total: 0, synced: 0, errors: [error instanceof Error ? error.message : String(error)] };
  } finally {
    isSyncing = false;
  }
};

/**
 * Inicia monitoramento automático de rede para sincronização
 */
export const startAutoSync = (): (() => void) => {
  console.log('🚀 [AUTO-SYNC] Iniciando monitoramento automático de rede...');
  
  let wasOnline = false;
  
  const unsubscribe = NetInfo.addEventListener(state => {
    const isOnlineNow = Boolean(state.isConnected && state.isInternetReachable);
    
    console.log(`🌐 [AUTO-SYNC] Estado da rede: conectado=${state.isConnected}, internet=${state.isInternetReachable}, tipo=${state.type}`);
    
    // Só sincronizar quando mudou de offline para online
    if (isOnlineNow && !wasOnline) {
      console.log('🔄 [AUTO-SYNC] Conexão recuperada! Iniciando sincronização automática...');
      
      // Aguardar um pouco para garantir que a conexão esteja estável
      setTimeout(async () => {
        try {
          console.log('🔄 [AUTO-SYNC] Executando sincronização...');
          const result = await syncAllPendingActions();
          
          if (result.total > 0) {
            console.log(`✅ [AUTO-SYNC] Sincronização concluída: ${result.synced}/${result.total} ações sincronizadas`);
            
            if (result.errors.length > 0) {
              console.log(`⚠️ [AUTO-SYNC] Erros encontrados: ${result.errors.length}`);
              result.errors.forEach(error => console.log(`   - ${error}`));
            }
          } else {
            console.log('📋 [AUTO-SYNC] Nenhuma ação pendente para sincronizar');
          }
        } catch (error) {
          console.error('❌ [AUTO-SYNC] Erro na sincronização automática:', error);
        }
      }, 2000); // 2 segundos para estabilizar a conexão
    } else if (!isOnlineNow && wasOnline) {
      console.log('📱 [AUTO-SYNC] Conexão perdida - modo offline');
    }
    
    wasOnline = isOnlineNow;
  });

  return () => {
    console.log('🛑 [AUTO-SYNC] Parando monitoramento automático de rede');
    unsubscribe();
  };
};

/**
 * Estatísticas de sincronização
 */
export const getSyncStats = async (): Promise<{
  total: number;
  pending: number;
  synced: number;
  failed: number;
}> => {
  return {
    total: 0,
    pending: 0,
    synced: 0,
    failed: 0
  };
};

/**
 * Callbacks para sincronização
 */
export const registerSyncCallback = (callback: (result: { total: number; synced: number; failed: number }) => void): () => void => {
  syncCallbacks.push(callback);
  
  return () => {
    const index = syncCallbacks.indexOf(callback);
    if (index > -1) {
      syncCallbacks.splice(index, 1);
    }
  };
};

export const registerOSFinalizadaCallback = (callback: (workOrderId: number) => void): () => void => {
  osFinalizadaCallbacks.push(callback);
  
  return () => {
    const index = osFinalizadaCallbacks.indexOf(callback);
    if (index > -1) {
      osFinalizadaCallbacks.splice(index, 1);
    }
  };
};

export const notifyOSFinalizadaCallbacks = (workOrderId: number) => {
  osFinalizadaCallbacks.forEach(callback => {
    try {
      callback(workOrderId);
    } catch (error) {
      console.error('❌ Erro no callback de OS finalizada:', error);
    }
  });
};

const notifySyncCallbacks = (result: { total: number; synced: number; failed: number }) => {
  syncCallbacks.forEach(callback => {
    try {
      callback(result);
    } catch (error) {
      console.error('❌ Erro no callback de sincronização:', error);
    }
  });
};

/**
 * MIGRADO: Funções de salvamento redirecionam para sistema unificado
 */
export const saveComentarioEtapaOffline = async (
  workOrderId: number,
  technicoId: string,
  etapaId: number,
  comentario: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  return await unifiedOfflineDataService.saveComentarioEtapa(workOrderId, technicoId, etapaId, comentario);
};

export const saveDadosRecordOffline = async (
  workOrderId: number,
  technicoId: string,
  entradaDadosId: number,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  return await unifiedOfflineDataService.saveDadosRecord(workOrderId, technicoId, entradaDadosId, photoUri);
};

/**
 * Funções obsoletas mantidas para compatibilidade (fazem nada)
 */
export const clearFailedActions = async (): Promise<void> => {};
export const retryFailedActions = async (): Promise<void> => {};
export const clearAllOfflineActions = async (): Promise<void> => {};
export const clearOfflineActionsForWorkOrder = async (workOrderId: number): Promise<void> => {};
export const cleanOrphanedOfflineData = async () => ({ success: true, cleaned: { dados_records: 0, fotos_extras: 0, actions: 0 }, errors: [] });
export const syncOfflineDadosRecords = async () => ({ success: true, synced: 0, errors: [] });
export const syncFotosExtrasOffline = async () => ({ success: true, synced: 0, errors: [] });
export const debugSyncStatusForWorkOrder = async (workOrderId: number): Promise<void> => {};
export const forceSyncPhotosForWorkOrder = async (workOrderId: number) => ({ success: true, results: { dados_records: { synced: 0, errors: [] }, fotos_extras: { synced: 0, errors: [] }, actions: { synced: 0, errors: [] } } });
export const debugFullDiagnosticAndSync = async (workOrderId: number): Promise<void> => {};

// Funções de salvamento offline obsoletas (redirecionam para integratedOfflineService)
export const savePhotoInicioOffline = async (workOrderId: number, technicoId: string, photoUri: string) => {
  const { savePhotoInicioOffline: savePhotoInicio } = await import('./integratedOfflineService');
  return await savePhotoInicio(workOrderId, technicoId, photoUri);
};

export const savePhotoFinalOffline = async (workOrderId: number, technicoId: string, photoUri: string) => {
  const { savePhotoFinalOffline: savePhotoFinal } = await import('./integratedOfflineService');
  return await savePhotoFinal(workOrderId, technicoId, photoUri);
};

export const saveAuditoriaFinalOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string,
  trabalhoRealizado: boolean,
  motivo?: string,
  comentario?: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  try {
    // Converter photo para base64 se necessário
    let photoBase64 = photoUri;
    if (photoUri && !photoUri.startsWith('data:image/')) {
      const FileSystem = require('expo-file-system');
      photoBase64 = await FileSystem.readAsStringAsync(photoUri, { encoding: FileSystem.EncodingType.Base64 });
      photoBase64 = `data:image/jpeg;base64,${photoBase64}`;
    }

    // Salvar usando sistema unificado
    return await unifiedOfflineDataService.saveAuditoriaFinal(
      workOrderId,
      technicoId,
      photoBase64,
      trabalhoRealizado,
      motivo,
      comentario
    );
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro ao salvar auditoria offline' 
    };
  }
};

export const saveChecklistEtapaOffline = async (
  workOrderId: number,
  technicoId: string,
  checklistData: { [entryId: number]: boolean }
) => {
  return { success: true, savedOffline: false };
};