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
 * Marca um status local como sincronizado e o remove para limpar a interface
 */
export const markLocalStatusAsSynced = async (workOrderId: number): Promise<void> => {
  try {
    const statusKey = `${LOCAL_STATUS_KEY}${workOrderId}`;
    const statusJson = await AsyncStorage.getItem(statusKey);
    
    if (statusJson) {
      // Remover completamente o status local quando sincronizado online
      // Isso garante que o ícone de sincronização não apareça mais
      await AsyncStorage.removeItem(statusKey);
      
      console.log(`✅ Status local removido após sincronização online para OS ${workOrderId}`);
    } else {
      console.log(`⚠️ Nenhum status local encontrado para OS ${workOrderId}`);
    }
  } catch (error) {
    console.error('❌ Erro ao marcar status como sincronizado:', error);
  }
};

/**
 * Limpa TODOS os dados locais de uma OS específica quando finalizada online
 * Remove: status local, etapas completadas, fotos, cache específico, etc.
 */
export const clearAllLocalDataForWorkOrder = async (workOrderId: number): Promise<void> => {
  try {
    console.log(`🧹 Limpando todos os dados locais da OS ${workOrderId}...`);
    
    // Buscar todas as chaves do AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();
    
    // Identificar chaves relacionadas a esta OS específica
    const keysToRemove = allKeys.filter(key => {
      return (
        // Status local da OS
        key === `${LOCAL_STATUS_KEY}${workOrderId}` ||
        // Etapas completadas da OS
        key === `completed_steps_${workOrderId}` ||
        // Fotos coletadas da OS
        key.startsWith(`collected_photos_${workOrderId}`) ||
        // Dados de progresso da OS
        key.startsWith(`progress_${workOrderId}`) ||
        // Cache específico da OS
        key.startsWith(`os_cache_${workOrderId}`) ||
        // Dados temporários da OS
        key.startsWith(`temp_data_${workOrderId}`) ||
        // Qualquer outro dado que contenha o ID da OS
        key.includes(`_${workOrderId}_`) || key.endsWith(`_${workOrderId}`)
      );
    });
    
    if (keysToRemove.length > 0) {
      // Remover todas as chaves relacionadas à OS
      await AsyncStorage.multiRemove(keysToRemove);
      console.log(`✅ Removidas ${keysToRemove.length} chaves locais da OS ${workOrderId}:`);
      keysToRemove.forEach(key => console.log(`   - ${key}`));
    } else {
      console.log(`ℹ️ Nenhum dado local encontrado para OS ${workOrderId}`);
    }
    
    // Também limpar do cache de work orders se necessário
    try {
      const { updateWorkOrderInCache } = require('./workOrderCacheService');
      // Não precisamos atualizar o cache aqui pois a OS já foi finalizada no servidor
      console.log(`✅ Limpeza completa da OS ${workOrderId} concluída`);
    } catch (cacheError) {
      console.log(`⚠️ Cache de work orders não disponível durante limpeza da OS ${workOrderId}`);
    }
    
  } catch (error) {
    console.error(`❌ Erro ao limpar dados locais da OS ${workOrderId}:`, error);
  }
};

/**
 * Remove status locais já sincronizados (para limpar indicadores visuais)
 */
export const cleanSyncedLocalStatuses = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const localStatusKeys = keys.filter(key => key.startsWith(LOCAL_STATUS_KEY));
    const keysToRemove: string[] = [];
    
    for (const key of localStatusKeys) {
      const statusJson = await AsyncStorage.getItem(key);
      
      if (statusJson) {
        const statusData: SingleLocalStatus = JSON.parse(statusJson);
        
        // Se foi sincronizado, marcar para remoção
        if (statusData.synced) {
          keysToRemove.push(key);
        }
      }
    }
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
      console.log(`🧹 Removidos ${keysToRemove.length} status locais já sincronizados`);
    }
  } catch (error) {
    console.error('❌ Erro ao limpar status sincronizados:', error);
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