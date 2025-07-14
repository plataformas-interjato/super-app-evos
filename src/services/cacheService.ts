// Removed direct AsyncStorage import - using storageAdapter dynamically in functions
// to avoid circular dependencies and ensure hybrid storage compatibility
import { ServiceStep, ServiceStepData } from './serviceStepsService';
import { WorkOrder } from '../types/workOrder';

const CACHE_KEYS = {
  SERVICE_STEPS: 'cached_service_steps',
  SERVICE_ENTRIES: 'cached_service_entries',
  CACHE_TIMESTAMP: 'cache_timestamp',
  WORK_ORDERS_CACHE: 'cached_work_orders',
  PRELOAD_STATUS: 'preload_status',
};

const CACHE_EXPIRY_HOURS = 24; // Cache válido por 24 horas

export interface CachedServiceSteps {
  [tipoOsId: number]: ServiceStep[];
}

export interface CachedServiceEntries {
  [etapaId: number]: ServiceStepData[];
}

interface PreloadStatus {
  success: boolean;
  workOrderIds: number[];
  errors: string[];
  timestamp: string;
}

/**
 * Verifica se o cache ainda é válido
 */
const isCacheValid = async (): Promise<boolean> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const timestampStr = await storageAdapter.getItem(CACHE_KEYS.CACHE_TIMESTAMP);
    
    if (!timestampStr) {
      return false;
    }

    const timestamp = new Date(timestampStr);
    const now = new Date();
    const diffHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);

    return diffHours < CACHE_EXPIRY_HOURS;
  } catch (error) {
    console.error('❌ Erro ao verificar validade do cache:', error);
    return false;
  }
};

/**
 * Verifica se existe cache de etapas
 */
const hasStepsCache = async (): Promise<boolean> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const stepsCache = await storageAdapter.getItem(CACHE_KEYS.SERVICE_STEPS);
    return !!stepsCache;
  } catch (error) {
    console.error('❌ Erro ao verificar cache de etapas:', error);
    return false;
  }
};

/**
 * Verifica se existe cache de entradas
 */
const hasEntriesCache = async (): Promise<boolean> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const entriesCache = await storageAdapter.getItem(CACHE_KEYS.SERVICE_ENTRIES);
    return !!entriesCache;
  } catch (error) {
    console.error('❌ Erro ao verificar cache de entradas:', error);
    return false;
  }
};

/**
 * Verifica se cache de OSs existe
 */
const hasWorkOrdersCache = async (): Promise<boolean> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const cachedStr = await storageAdapter.getItem(CACHE_KEYS.WORK_ORDERS_CACHE);
    return !!cachedStr;
  } catch (error) {
    console.error('❌ Erro ao verificar cache de OSs:', error);
    return false;
  }
};

/**
 * Verifica se pré-carregamento já foi feito
 */
const hasPreloadStatus = async (): Promise<boolean> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const statusStr = await storageAdapter.getItem(CACHE_KEYS.PRELOAD_STATUS);
    return !!statusStr;
  } catch (error) {
    console.error('❌ Erro ao verificar status de pré-carregamento:', error);
    return false;
  }
};

/**
 * Salva etapas no cache local
 */
export const cacheServiceSteps = async (
  tipoOsId: number,
  steps: ServiceStep[]
): Promise<{ success: boolean; error: string | null }> => {
  try {
    // Usar storageAdapter ao invés do AsyncStorage direto
    const { default: storageAdapter } = await import('./storageAdapter');
    
    // Buscar cache existente
    const existingCacheStr = await storageAdapter.getItem(CACHE_KEYS.SERVICE_STEPS);
    const existingCache: CachedServiceSteps = existingCacheStr 
      ? JSON.parse(existingCacheStr) 
      : {};

    // Adicionar/atualizar etapas para este tipo
    existingCache[tipoOsId] = steps;

    // Salvar cache atualizado
    await storageAdapter.setItem(CACHE_KEYS.SERVICE_STEPS, JSON.stringify(existingCache));
    
    // Atualizar timestamp
    await storageAdapter.setItem(CACHE_KEYS.CACHE_TIMESTAMP, new Date().toISOString());

    return { success: true, error: null };
  } catch (error) {
    console.error('❌ Erro ao salvar etapas no cache:', error);
    return { success: false, error: 'Erro ao salvar etapas no cache' };
  }
};

/**
 * Salva entradas no cache local
 */
export const cacheServiceEntries = async (
  entriesByStep: CachedServiceEntries
): Promise<{ success: boolean; error: string | null }> => {
  try {
    // Usar storageAdapter ao invés do AsyncStorage direto
    const { default: storageAdapter } = await import('./storageAdapter');
    
    // Buscar cache existente
    const existingCacheStr = await storageAdapter.getItem(CACHE_KEYS.SERVICE_ENTRIES);
    const existingCache: CachedServiceEntries = existingCacheStr 
      ? JSON.parse(existingCacheStr) 
      : {};

    // Mesclar com cache existente
    const updatedCache = { ...existingCache, ...entriesByStep };

    // Salvar cache atualizado
    await storageAdapter.setItem(CACHE_KEYS.SERVICE_ENTRIES, JSON.stringify(updatedCache));
    
    // Atualizar timestamp
    await storageAdapter.setItem(CACHE_KEYS.CACHE_TIMESTAMP, new Date().toISOString());

    const totalEntries = Object.values(entriesByStep).reduce((sum, entries) => sum + entries.length, 0);
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ Erro ao salvar entradas no cache:', error);
    return { success: false, error: 'Erro ao salvar entradas no cache' };
  }
};

/**
 * Busca etapas do cache local - VERSÃO OFFLINE (sem verificação de validade)
 */
export const getCachedServiceSteps = async (
  tipoOsId: number
): Promise<{ data: ServiceStep[] | null; error: string | null; fromCache: boolean }> => {
  try {
    console.log(`🔍 Buscando etapas no cache para tipo ${tipoOsId}...`);
    
    // Usar storageAdapter ao invés do AsyncStorage direto
    const { default: storageAdapter } = await import('./storageAdapter');
    const cacheStr = await storageAdapter.getItem(CACHE_KEYS.SERVICE_STEPS);
    
    if (!cacheStr) {
      console.log('📭 Nenhum cache de etapas encontrado');
      return { data: null, error: 'Cache não encontrado', fromCache: false };
    }

    const cache: CachedServiceSteps = JSON.parse(cacheStr);
    const steps = cache[tipoOsId];

    if (!steps || steps.length === 0) {
      console.log(`📭 Nenhuma etapa encontrada no cache para tipo ${tipoOsId}`);
      return { data: null, error: 'Etapas não encontradas no cache', fromCache: false };
    }

    console.log(`📱 ${steps.length} etapas encontradas no cache para tipo ${tipoOsId}`);
    return { data: steps, error: null, fromCache: true };
  } catch (error) {
    console.error('❌ Erro ao buscar etapas do cache:', error);
    return { data: null, error: 'Erro ao buscar etapas do cache', fromCache: false };
  }
};

/**
 * Busca entradas do cache local - VERSÃO OFFLINE (sem verificação de validade)
 */
export const getCachedServiceEntries = async (
  etapaIds: number[]
): Promise<{ data: CachedServiceEntries | null; error: string | null; fromCache: boolean }> => {
  try {
    console.log(`🔍 Buscando entradas no cache para ${etapaIds.length} etapas...`);
    
    // Usar storageAdapter ao invés do AsyncStorage direto
    const { default: storageAdapter } = await import('./storageAdapter');
    const cacheStr = await storageAdapter.getItem(CACHE_KEYS.SERVICE_ENTRIES);
    
    if (!cacheStr) {
      console.log('📭 Nenhum cache de entradas encontrado');
      return { data: null, error: 'Cache não encontrado', fromCache: false };
    }

    const cache: CachedServiceEntries = JSON.parse(cacheStr);
    
    // Filtrar apenas as entradas das etapas solicitadas
    const filteredEntries: CachedServiceEntries = {};
    let totalEntries = 0;

    etapaIds.forEach(etapaId => {
      if (cache[etapaId]) {
        filteredEntries[etapaId] = cache[etapaId];
        totalEntries += cache[etapaId].length;
      }
    });

    console.log(`📱 ${totalEntries} entradas encontradas no cache para ${etapaIds.length} etapas`);
    return { data: filteredEntries, error: null, fromCache: true };
  } catch (error) {
    console.error('❌ Erro ao buscar entradas do cache:', error);
    return { data: null, error: 'Erro ao buscar entradas do cache', fromCache: false };
  }
};

/**
 * Busca etapas com entradas do cache (função principal)
 */
export const getCachedServiceStepsWithData = async (
  tipoOsId: number
): Promise<{ data: ServiceStep[] | null; error: string | null; fromCache: boolean }> => {
  try {
    // 1. Buscar etapas do cache
    const { data: steps, error: stepsError, fromCache: stepsFromCache } = await getCachedServiceSteps(tipoOsId);
    
    if (stepsError || !steps || !stepsFromCache) {
      return { data: null, error: stepsError, fromCache: false };
    }

    // 2. Buscar entradas do cache
    const etapaIds = steps.map(step => step.id);
    const { data: entriesData, error: entriesError, fromCache: entriesFromCache } = await getCachedServiceEntries(etapaIds);

    if (entriesError || !entriesFromCache) {
      console.warn('⚠️ Erro ao buscar entradas do cache, continuando apenas com etapas:', entriesError);
      // Retornar etapas sem entradas
      return { data: steps, error: null, fromCache: true };
    }

    // 3. Combinar etapas com entradas
    const stepsWithData = steps.map(step => ({
      ...step,
      entradas: entriesData?.[step.id] || []
    }));

    return { data: stepsWithData, error: null, fromCache: true };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar dados do cache:', error);
    return { data: null, error: 'Erro inesperado ao buscar dados do cache', fromCache: false };
  }
};

/**
 * Limpa todo o cache de etapas e entradas
 */
export const clearServiceCache = async (): Promise<{ success: boolean; error: string | null }> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    await Promise.all([
      storageAdapter.removeItem(CACHE_KEYS.SERVICE_STEPS),
      storageAdapter.removeItem(CACHE_KEYS.SERVICE_ENTRIES),
      storageAdapter.removeItem(CACHE_KEYS.CACHE_TIMESTAMP),
    ]);

    console.log('🗑️ Cache de etapas e entradas limpo');
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ Erro ao limpar cache:', error);
    return { success: false, error: 'Erro ao limpar cache' };
  }
};

/**
 * Obtém informações sobre o cache
 */
export const getCacheInfo = async (): Promise<{
  isValid: boolean;
  timestamp: string | null;
  stepsCount: number;
  entriesCount: number;
}> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const isValid = await isCacheValid();
    const timestamp = await storageAdapter.getItem(CACHE_KEYS.CACHE_TIMESTAMP);
    
    let stepsCount = 0;
    let entriesCount = 0;

    const stepsCache = await storageAdapter.getItem(CACHE_KEYS.SERVICE_STEPS);
    if (stepsCache) {
      const steps: CachedServiceSteps = JSON.parse(stepsCache);
      stepsCount = Object.values(steps).reduce((sum, stepArray) => sum + stepArray.length, 0);
    }

    const entriesCache = await storageAdapter.getItem(CACHE_KEYS.SERVICE_ENTRIES);
    if (entriesCache) {
      const entries: CachedServiceEntries = JSON.parse(entriesCache);
      entriesCount = Object.values(entries).reduce((sum, entryArray) => sum + entryArray.length, 0);
    }

    return { isValid, timestamp, stepsCount, entriesCount };
  } catch (error) {
    console.error('❌ Erro ao obter informações do cache:', error);
    return { isValid: false, timestamp: null, stepsCount: 0, entriesCount: 0 };
  }
};

/**
 * Pré-carrega TODAS as informações necessárias para as OSs trabalharem offline
 */
export const preloadAllWorkOrdersData = async (workOrders: WorkOrder[]): Promise<{
  success: boolean;
  cached: number;
  errors: string[];
}> => {
  const errors: string[] = [];
  let cached = 0;

  try {
    // Agrupar por tipo_os_id para otimizar
    const tiposOsIds = [...new Set(workOrders.map(wo => wo.tipo_os_id))];

    // Carregar dados para cada tipo de OS
    for (const tipoOsId of tiposOsIds) {
      try {
        // Verificar se tipoOsId é válido
        if (!tipoOsId || typeof tipoOsId !== 'number') {
          console.warn(`⚠️ Tipo OS inválido: ${tipoOsId}`);
          continue;
        }
        
        // Importar a função dinamicamente
        const { getServiceStepsWithDataCached } = await import('./serviceStepsService');
        
        // Carregar etapas com dados (usando ordemServicoId = 0 para pré-carregamento)
        const result = await getServiceStepsWithDataCached(tipoOsId, 0);
        
        if (result.data && result.data.length > 0) {
          cached++;
        }
      } catch (stepError) {
        const errorMsg = `Erro ao carregar tipo OS ${tipoOsId}: ${stepError}`;
        errors.push(errorMsg);
      }
    }

    // Salvar status do pré-carregamento
    const workOrderIds = workOrders.map(wo => wo.id);
    await savePreloadStatus(errors.length === 0, workOrderIds, errors);

    return {
      success: errors.length === 0,
      cached,
      errors
    };
  } catch (error) {
    const errorMsg = `Erro geral no pré-carregamento: ${error}`;
    errors.push(errorMsg);
    
    // Salvar status de falha
    const workOrderIds = workOrders.map(wo => wo.id);
    await savePreloadStatus(false, workOrderIds, errors);
    
    return {
      success: false,
      cached,
      errors
    };
  }
};

/**
 * Verifica se o pré-carregamento é necessário
 */
export const shouldPreload = async (currentWorkOrders: WorkOrder[]): Promise<boolean> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const preloadStatusStr = await storageAdapter.getItem(CACHE_KEYS.PRELOAD_STATUS);
    
    if (!preloadStatusStr) {
      console.log('📱 Nenhum pré-carregamento anterior encontrado');
      return true;
    }

    const preloadStatus: PreloadStatus = JSON.parse(preloadStatusStr);
    
    // Verificar se o cache expirou
    const isValid = await isCacheValid();
    if (!isValid) {
      console.log('⏰ Cache expirado, pré-carregamento necessário');
      return true;
    }

    // Verificar se há novas OSs
    const currentIds = currentWorkOrders.map(wo => wo.id).sort();
    const cachedIds = preloadStatus.workOrderIds.sort();
    
    const hasNewWorkOrders = !arraysEqual(currentIds, cachedIds);
    
    if (hasNewWorkOrders) {
      console.log('🆕 Novas OSs detectadas, pré-carregamento necessário');
      return true;
    }

    // Verificar se o último pré-carregamento teve sucesso
    if (!preloadStatus.success) {
      console.log('❌ Último pré-carregamento teve falhas, tentando novamente');
      return true;
    }

    console.log('✅ Pré-carregamento ainda válido');
    return false;

  } catch (error) {
    console.error('💥 Erro ao verificar necessidade de pré-carregamento:', error);
    return true; // Em caso de erro, sempre pré-carregar
  }
};

/**
 * Salva o status do pré-carregamento
 */
const savePreloadStatus = async (
  success: boolean,
  workOrderIds: number[],
  errors: string[]
): Promise<void> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    
    const preloadStatus: PreloadStatus = {
      success,
      workOrderIds,
      errors,
      timestamp: new Date().toISOString(),
    };

    await storageAdapter.setItem(
      CACHE_KEYS.PRELOAD_STATUS,
      JSON.stringify(preloadStatus)
    );
  } catch (error) {
    console.error('❌ Erro ao salvar status de pré-carregamento:', error);
  }
};

/**
 * Obtém OSs do cache local
 */
export const getCachedWorkOrders = async (): Promise<WorkOrder[] | null> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const cachedStr = await storageAdapter.getItem(CACHE_KEYS.WORK_ORDERS_CACHE);
    if (!cachedStr) return null;

    const cached = JSON.parse(cachedStr);
    return cached.workOrders || null;
  } catch (error) {
    console.error('❌ Erro ao buscar OSs do cache:', error);
    return null;
  }
};

/**
 * Obtém o status do pré-carregamento
 */
export const getPreloadStatus = async (): Promise<PreloadStatus | null> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    const statusStr = await storageAdapter.getItem(CACHE_KEYS.PRELOAD_STATUS);
    if (!statusStr) return null;

    return JSON.parse(statusStr);
  } catch (error) {
    console.error('❌ Erro ao obter status de pré-carregamento:', error);
    return null;
  }
};

/**
 * Força limpeza completa do cache
 */
export const clearAllCache = async (): Promise<void> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    await Promise.all([
      storageAdapter.removeItem(CACHE_KEYS.SERVICE_STEPS),
      storageAdapter.removeItem(CACHE_KEYS.SERVICE_ENTRIES),
      storageAdapter.removeItem(CACHE_KEYS.CACHE_TIMESTAMP),
      storageAdapter.removeItem(CACHE_KEYS.WORK_ORDERS_CACHE),
      storageAdapter.removeItem(CACHE_KEYS.PRELOAD_STATUS),
    ]);
    
    console.log('🧹 Cache completo limpo');
  } catch (error) {
    console.error('❌ Erro ao limpar cache:', error);
  }
};

// Função auxiliar para comparar arrays
const arraysEqual = (a: number[], b: number[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
};

/**
 * Lista todos os dados do cache para debug
 */
export const debugCacheContents = async (): Promise<void> => {
  try {
    const { default: storageAdapter } = await import('./storageAdapter');
    
    console.log('🔍 === DEBUG DO CACHE ===');
    
    // 1. Verificar cache de etapas
    const stepsCache = await storageAdapter.getItem(CACHE_KEYS.SERVICE_STEPS);
    if (stepsCache) {
      const steps: CachedServiceSteps = JSON.parse(stepsCache);
      console.log('📋 ETAPAS NO CACHE:');
      Object.keys(steps).forEach(tipoOsId => {
        console.log(`  - Tipo OS ${tipoOsId}: ${steps[parseInt(tipoOsId)].length} etapas`);
        steps[parseInt(tipoOsId)].forEach((step, index) => {
          console.log(`    ${index + 1}. ${step.titulo} (ID: ${step.id})`);
        });
      });
    } else {
      console.log('❌ Nenhum cache de etapas encontrado');
    }
    
    // 2. Verificar cache de entradas
    const entriesCache = await storageAdapter.getItem(CACHE_KEYS.SERVICE_ENTRIES);
    if (entriesCache) {
      const entries: CachedServiceEntries = JSON.parse(entriesCache);
      console.log('📝 ENTRADAS NO CACHE:');
      Object.keys(entries).forEach(etapaId => {
        console.log(`  - Etapa ${etapaId}: ${entries[parseInt(etapaId)].length} entradas`);
      });
    } else {
      console.log('❌ Nenhum cache de entradas encontrado');
    }
    
    // 3. Verificar timestamp
    const timestamp = await storageAdapter.getItem(CACHE_KEYS.CACHE_TIMESTAMP);
    if (timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      console.log(`⏰ Cache criado em: ${date.toLocaleString()}`);
      console.log(`⏰ Idade do cache: ${diffHours.toFixed(1)} horas`);
      console.log(`⏰ Cache válido: ${diffHours < CACHE_EXPIRY_HOURS ? 'SIM' : 'NÃO'}`);
    } else {
      console.log('❌ Nenhum timestamp de cache encontrado');
    }
    
    // 4. Verificar status de pré-carregamento
    const preloadStatus = await storageAdapter.getItem(CACHE_KEYS.PRELOAD_STATUS);
    if (preloadStatus) {
      const status: PreloadStatus = JSON.parse(preloadStatus);
      console.log('🔄 STATUS DE PRÉ-CARREGAMENTO:');
      console.log(`  - Sucesso: ${status.success ? 'SIM' : 'NÃO'}`);
      console.log(`  - OSs processadas: ${status.workOrderIds.length}`);
      console.log(`  - Erros: ${status.errors.length}`);
      console.log(`  - Timestamp: ${new Date(status.timestamp).toLocaleString()}`);
    } else {
      console.log('❌ Nenhum status de pré-carregamento encontrado');
    }
    
    console.log('🔍 === FIM DO DEBUG ===');
  } catch (error) {
    console.error('💥 Erro no debug do cache:', error);
  }
}; 