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
 * Remove: status local, etapas completadas, fotos, cache específico, dados locais, etc.
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
        // Dados locais de etapas da OS
        key.startsWith(`local_step_data_`) && key.includes(`_${workOrderId}_`) ||
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
    
    // NOVO: Limpar dados específicos de fotos extras e dados de auditoria
    await clearWorkOrderSpecificData(workOrderId);
    
    // Limpar dados locais usando o novo serviço
    try {
      const localDataService = (await import('./localDataService')).default;
      await localDataService.clearLocalDataForWorkOrder(workOrderId);
      console.log(`✅ Dados locais de etapas limpos para OS ${workOrderId}`);
    } catch (localError) {
      console.warn('⚠️ Erro ao limpar dados locais de etapas:', localError);
    }
    
    console.log(`🧹 Limpeza completa finalizada para OS ${workOrderId}`);
  } catch (error) {
    console.error(`❌ Erro ao limpar dados locais da OS ${workOrderId}:`, error);
  }
};

/**
 * Limpa dados específicos de uma OS em chaves globais como offline_fotos_extras e offline_dados_records
 * NOVO: Esta função garante que fotos extras e dados de auditoria sejam removidos após finalização
 */
const clearWorkOrderSpecificData = async (workOrderId: number): Promise<void> => {
  try {
    console.log(`🧹 Limpando dados específicos da OS ${workOrderId} em chaves globais...`);
    
    let totalItemsRemoved = 0;
    
    // 1. Limpar fotos extras (offline_fotos_extras)
    try {
      const offlineExtrasData = await AsyncStorage.getItem('offline_fotos_extras');
      if (offlineExtrasData) {
        const extrasRecords = JSON.parse(offlineExtrasData);
        const originalCount = Object.keys(extrasRecords).length;
        
        // Filtrar removendo registros desta OS
        const filteredExtras: any = {};
        Object.entries(extrasRecords).forEach(([recordKey, record]: [string, any]) => {
          if (record.ordem_servico_id !== workOrderId) {
            filteredExtras[recordKey] = record;
          }
        });
        
        const removedCount = originalCount - Object.keys(filteredExtras).length;
        if (removedCount > 0) {
          await AsyncStorage.setItem('offline_fotos_extras', JSON.stringify(filteredExtras));
          console.log(`✅ Removidas ${removedCount} fotos extras da OS ${workOrderId}`);
          totalItemsRemoved += removedCount;
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao limpar fotos extras:', error);
    }
    
    // 2. Limpar dados de fotos (offline_dados_records)
    try {
      const offlineDataRecords = await AsyncStorage.getItem('offline_dados_records');
      if (offlineDataRecords) {
        const dataRecords = JSON.parse(offlineDataRecords);
        const originalCount = Object.keys(dataRecords).length;
        
        // Filtrar removendo registros desta OS
        const filteredData: any = {};
        Object.entries(dataRecords).forEach(([recordKey, record]: [string, any]) => {
          if (record.ordem_servico_id !== workOrderId) {
            filteredData[recordKey] = record;
          }
        });
        
        const removedCount = originalCount - Object.keys(filteredData).length;
        if (removedCount > 0) {
          await AsyncStorage.setItem('offline_dados_records', JSON.stringify(filteredData));
          console.log(`✅ Removidos ${removedCount} dados de fotos da OS ${workOrderId}`);
          totalItemsRemoved += removedCount;
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao limpar dados de fotos:', error);
    }
    
    // 3. Limpar outras chaves globais que possam conter dados da OS
    try {
      const globalKeysToCheck = [
        'service_steps_cache',
        'work_orders_cache',
        'completed_work_orders',
        'cached_auditorias',
        'cached_service_data'
      ];
      
      for (const key of globalKeysToCheck) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            
            // Se é um array
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter(item => 
                item.ordem_servico_id !== workOrderId && 
                item.workOrderId !== workOrderId &&
                item.id !== workOrderId
              );
              
              if (filtered.length !== parsed.length) {
                await AsyncStorage.setItem(key, JSON.stringify(filtered));
                console.log(`✅ Dados da OS ${workOrderId} removidos de ${key}`);
                totalItemsRemoved += (parsed.length - filtered.length);
              }
            }
            // Se é um objeto com chaves
            else if (typeof parsed === 'object' && parsed !== null) {
              const filtered: any = {};
              let hasChanges = false;
              
              Object.entries(parsed).forEach(([itemKey, item]: [string, any]) => {
                const shouldKeep = !(
                  item?.ordem_servico_id === workOrderId ||
                  item?.workOrderId === workOrderId ||
                  item?.id === workOrderId ||
                  itemKey.includes(`_${workOrderId}_`) ||
                  itemKey.includes(`${workOrderId}_`) ||
                  itemKey.endsWith(`_${workOrderId}`)
                );
                
                if (shouldKeep) {
                  filtered[itemKey] = item;
                } else {
                  hasChanges = true;
                  totalItemsRemoved++;
                }
              });
              
              if (hasChanges) {
                await AsyncStorage.setItem(key, JSON.stringify(filtered));
                console.log(`✅ Dados da OS ${workOrderId} removidos de ${key}`);
              }
            }
          }
        } catch (keyError) {
          console.warn(`⚠️ Erro ao processar chave ${key}:`, keyError);
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao limpar chaves globais:', error);
    }
    
    if (totalItemsRemoved > 0) {
      console.log(`✅ Total de ${totalItemsRemoved} itens específicos removidos da OS ${workOrderId}`);
    } else {
      console.log(`ℹ️ Nenhum dado específico encontrado para remover da OS ${workOrderId}`);
    }
    
  } catch (error) {
    console.error(`❌ Erro ao limpar dados específicos da OS ${workOrderId}:`, error);
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