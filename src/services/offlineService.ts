import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AuditoriaTecnico, savePhotoInicio } from './auditService';

// Tipos para dados offline
export interface OfflineAction {
  id: string;
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'UPDATE_STATUS' | 'ADD_COMMENT';
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
        motivo: 'Início da ordem de serviço'
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
    console.log('🔄 Sincronizando ação:', action.type, action.id);

    switch (action.type) {
      case 'PHOTO_INICIO':
        const photoAction = action as OfflinePhotoAction;
        const { data, error } = await savePhotoInicio(
          action.workOrderId,
          action.technicoId,
          photoAction.data.photoUri
        );
        
        if (!error && data) {
          await markActionAsSynced(action.id);
          console.log('✅ Foto de início sincronizada:', action.id);
          return true;
        } else {
          console.log('❌ Falha na sincronização da foto:', error);
          await incrementSyncAttempts(action.id);
          return false;
        }

      // Adicionar outros tipos de ação aqui no futuro
      default:
        console.log('⚠️ Tipo de ação não implementado:', action.type);
        return false;
    }
  } catch (error) {
    console.error('💥 Erro na sincronização da ação:', error);
    await incrementSyncAttempts(action.id);
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

  try {
    const actions = await getOfflineActions();
    const pendingActions = actions.filter(action => 
      !action.synced && action.attempts < MAX_SYNC_ATTEMPTS
    );

    console.log(`📊 ${pendingActions.length} ações pendentes para sincronizar`);

    let synced = 0;
    let failed = 0;

    for (const action of pendingActions) {
      const success = await syncAction(action);
      if (success) {
        synced++;
      } else {
        failed++;
      }
    }

    // Limpar ações sincronizadas
    if (synced > 0) {
      await cleanSyncedActions();
    }

    console.log(`✅ Sincronização concluída: ${synced} sucesso, ${failed} falhas`);
    return { total: pendingActions.length, synced, failed };

  } catch (error) {
    console.error('💥 Erro na sincronização:', error);
    return { total: 0, synced: 0, failed: 1 };
  } finally {
    // Liberar lock
    isSyncing = false;
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