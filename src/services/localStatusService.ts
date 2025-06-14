import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateWorkOrderInCache } from './workOrderCacheService';

const LOCAL_STATUS_KEY = 'local_work_order_status_';

interface LocalWorkOrderStatus {
  [workOrderId: string]: {
    status: string;
    timestamp: string;
    synced: boolean;
  };
}

interface SingleLocalStatus {
  status: string;
  updatedAt: string;
  synced: boolean;
}

/**
 * Atualiza o status local de uma OS
 */
export const updateLocalWorkOrderStatus = async (
  workOrderId: number,
  status: 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada',
  synced: boolean = false
): Promise<void> => {
  try {
    const statusData: SingleLocalStatus = {
      status,
      synced,
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(
      `${LOCAL_STATUS_KEY}${workOrderId}`,
      JSON.stringify(statusData)
    );

    // Também atualizar no cache de OSs se existir
    try {
      await updateWorkOrderInCache(workOrderId, { status });
      console.log(`✅ Status local da OS ${workOrderId} atualizado: ${status} (synced: ${synced}) + cache`);
    } catch (cacheError) {
      console.log(`✅ Status local da OS ${workOrderId} atualizado: ${status} (synced: ${synced}) - cache não disponível`);
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar status local:', error);
    throw error;
  }
};

/**
 * Busca o status local de uma OS
 */
export const getLocalWorkOrderStatus = async (
  workOrderId: number
): Promise<{ status: string; synced: boolean } | null> => {
  try {
    const statusJson = await AsyncStorage.getItem(`${LOCAL_STATUS_KEY}${workOrderId}`);
    
    if (statusJson) {
      const statusData: SingleLocalStatus = JSON.parse(statusJson);
      return {
        status: statusData.status,
        synced: statusData.synced,
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar status local:', error);
    return null;
  }
};

/**
 * Busca todos os status locais
 */
export const getLocalWorkOrderStatuses = async (): Promise<LocalWorkOrderStatus> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const localStatusKeys = keys.filter(key => key.startsWith(LOCAL_STATUS_KEY));
    
    const statuses: LocalWorkOrderStatus = {};
    
    for (const key of localStatusKeys) {
      const workOrderId = key.replace(LOCAL_STATUS_KEY, '');
      const statusJson = await AsyncStorage.getItem(key);
      
      if (statusJson) {
        const statusData: SingleLocalStatus = JSON.parse(statusJson);
        statuses[workOrderId] = {
          status: statusData.status,
          timestamp: statusData.updatedAt,
          synced: statusData.synced,
        };
      }
    }
    
    return statuses;
  } catch (error) {
    console.error('❌ Erro ao buscar status locais:', error);
    return {};
  }
};

/**
 * Marca um status local como sincronizado
 */
export const markLocalStatusAsSynced = async (workOrderId: number): Promise<void> => {
  try {
    const statusJson = await AsyncStorage.getItem(`${LOCAL_STATUS_KEY}${workOrderId}`);
    
    if (statusJson) {
      const statusData: SingleLocalStatus = JSON.parse(statusJson);
      statusData.synced = true;
      
      await AsyncStorage.setItem(
        `${LOCAL_STATUS_KEY}${workOrderId}`,
        JSON.stringify(statusData)
      );
      
      console.log(`✅ Status local marcado como sincronizado para OS ${workOrderId}`);
    }
  } catch (error) {
    console.error('❌ Erro ao marcar status como sincronizado:', error);
  }
};

/**
 * Remove status locais antigos (mais de 30 dias)
 */
export const cleanOldLocalStatuses = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const localStatusKeys = keys.filter(key => key.startsWith(LOCAL_STATUS_KEY));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    for (const key of localStatusKeys) {
      const statusJson = await AsyncStorage.getItem(key);
      
      if (statusJson) {
        const statusData: SingleLocalStatus = JSON.parse(statusJson);
        const statusDate = new Date(statusData.updatedAt);
        
        if (statusDate <= thirtyDaysAgo) {
          await AsyncStorage.removeItem(key);
        }
      }
    }
    
    console.log('🧹 Status locais antigos removidos');
  } catch (error) {
    console.error('❌ Erro ao limpar status antigos:', error);
  }
}; 