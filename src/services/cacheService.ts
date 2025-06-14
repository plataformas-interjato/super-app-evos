import AsyncStorage from '@react-native-async-storage/async-storage';
import { ServiceStep, ServiceStepData } from './serviceStepsService';

const CACHE_KEYS = {
  SERVICE_STEPS: 'cached_service_steps',
  SERVICE_ENTRIES: 'cached_service_entries',
  CACHE_TIMESTAMP: 'cache_timestamp',
};

const CACHE_EXPIRY_HOURS = 24; // Cache válido por 24 horas

export interface CachedServiceSteps {
  [tipoOsId: number]: ServiceStep[];
}

export interface CachedServiceEntries {
  [etapaId: number]: ServiceStepData[];
}

/**
 * Verifica se o cache ainda é válido
 */
const isCacheValid = async (): Promise<boolean> => {
  try {
    const timestamp = await AsyncStorage.getItem(CACHE_KEYS.CACHE_TIMESTAMP);
    if (!timestamp) return false;

    const cacheTime = new Date(timestamp);
    const now = new Date();
    const diffHours = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);

    return diffHours < CACHE_EXPIRY_HOURS;
  } catch (error) {
    console.error('❌ Erro ao verificar validade do cache:', error);
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
    // Buscar cache existente
    const existingCacheStr = await AsyncStorage.getItem(CACHE_KEYS.SERVICE_STEPS);
    const existingCache: CachedServiceSteps = existingCacheStr 
      ? JSON.parse(existingCacheStr) 
      : {};

    // Adicionar/atualizar etapas para este tipo
    existingCache[tipoOsId] = steps;

    // Salvar cache atualizado
    await AsyncStorage.setItem(CACHE_KEYS.SERVICE_STEPS, JSON.stringify(existingCache));
    
    // Atualizar timestamp
    await AsyncStorage.setItem(CACHE_KEYS.CACHE_TIMESTAMP, new Date().toISOString());

    console.log(`✅ Etapas do tipo ${tipoOsId} salvas no cache (${steps.length} etapas)`);
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
    // Buscar cache existente
    const existingCacheStr = await AsyncStorage.getItem(CACHE_KEYS.SERVICE_ENTRIES);
    const existingCache: CachedServiceEntries = existingCacheStr 
      ? JSON.parse(existingCacheStr) 
      : {};

    // Mesclar com cache existente
    const updatedCache = { ...existingCache, ...entriesByStep };

    // Salvar cache atualizado
    await AsyncStorage.setItem(CACHE_KEYS.SERVICE_ENTRIES, JSON.stringify(updatedCache));
    
    // Atualizar timestamp
    await AsyncStorage.setItem(CACHE_KEYS.CACHE_TIMESTAMP, new Date().toISOString());

    const totalEntries = Object.values(entriesByStep).reduce((sum, entries) => sum + entries.length, 0);
    console.log(`✅ ${totalEntries} entradas salvas no cache`);
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ Erro ao salvar entradas no cache:', error);
    return { success: false, error: 'Erro ao salvar entradas no cache' };
  }
};

/**
 * Busca etapas do cache local
 */
export const getCachedServiceSteps = async (
  tipoOsId: number
): Promise<{ data: ServiceStep[] | null; error: string | null; fromCache: boolean }> => {
  try {
    // Verificar se cache é válido
    const isValid = await isCacheValid();
    if (!isValid) {
      console.log('⏰ Cache expirado ou inválido');
      return { data: null, error: 'Cache expirado', fromCache: false };
    }

    const cacheStr = await AsyncStorage.getItem(CACHE_KEYS.SERVICE_STEPS);
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

    console.log(`📱 ${steps.length} etapas carregadas do cache para tipo ${tipoOsId}`);
    return { data: steps, error: null, fromCache: true };
  } catch (error) {
    console.error('❌ Erro ao buscar etapas do cache:', error);
    return { data: null, error: 'Erro ao buscar etapas do cache', fromCache: false };
  }
};

/**
 * Busca entradas do cache local
 */
export const getCachedServiceEntries = async (
  etapaIds: number[]
): Promise<{ data: CachedServiceEntries | null; error: string | null; fromCache: boolean }> => {
  try {
    // Verificar se cache é válido
    const isValid = await isCacheValid();
    if (!isValid) {
      console.log('⏰ Cache de entradas expirado ou inválido');
      return { data: null, error: 'Cache expirado', fromCache: false };
    }

    const cacheStr = await AsyncStorage.getItem(CACHE_KEYS.SERVICE_ENTRIES);
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

    console.log(`📱 ${totalEntries} entradas carregadas do cache para ${etapaIds.length} etapas`);
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
    await AsyncStorage.multiRemove([
      CACHE_KEYS.SERVICE_STEPS,
      CACHE_KEYS.SERVICE_ENTRIES,
      CACHE_KEYS.CACHE_TIMESTAMP,
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
    const isValid = await isCacheValid();
    const timestamp = await AsyncStorage.getItem(CACHE_KEYS.CACHE_TIMESTAMP);
    
    let stepsCount = 0;
    let entriesCount = 0;

    const stepsCache = await AsyncStorage.getItem(CACHE_KEYS.SERVICE_STEPS);
    if (stepsCache) {
      const steps: CachedServiceSteps = JSON.parse(stepsCache);
      stepsCount = Object.values(steps).reduce((sum, stepArray) => sum + stepArray.length, 0);
    }

    const entriesCache = await AsyncStorage.getItem(CACHE_KEYS.SERVICE_ENTRIES);
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