import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkOrder, FilterStatus } from '../types/workOrder';

const CACHE_KEYS = {
  WORK_ORDERS: 'cached_work_orders',
  CACHE_TIMESTAMP: 'work_orders_cache_timestamp',
  USER_WORK_ORDERS: 'cached_user_work_orders_', // Será concatenado com userId
};

const CACHE_EXPIRY_HOURS = 24; // Cache válido por 24 horas

export interface CachedWorkOrders {
  workOrders: WorkOrder[];
  timestamp: string;
  userId?: string;
}

/**
 * Verifica se o cache ainda é válido
 */
const isCacheValid = async (cacheKey: string): Promise<boolean> => {
  try {
    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) return false;

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    const cacheTime = new Date(parsed.timestamp);
    const now = new Date();
    const diffHours = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);

    return diffHours < CACHE_EXPIRY_HOURS;
  } catch (error) {
    console.error('❌ Erro ao verificar validade do cache:', error);
    return false;
  }
};

/**
 * Salva ordens de serviço no cache local
 */
export const cacheWorkOrders = async (
  workOrders: WorkOrder[],
  userId?: string
): Promise<void> => {
  try {
    const cacheData: CachedWorkOrders = {
      workOrders,
      timestamp: new Date().toISOString(),
      userId,
    };

    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`✅ ${workOrders.length} ordens de serviço salvas no cache${userId ? ` para usuário ${userId}` : ''}`);
  } catch (error) {
    console.error('❌ Erro ao salvar ordens de serviço no cache:', error);
  }
};

/**
 * Busca ordens de serviço do cache local
 */
export const getCachedWorkOrders = async (
  userId?: string
): Promise<{ data: WorkOrder[] | null; fromCache: boolean; error?: string }> => {
  try {
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    // Verificar se o cache é válido
    const isValid = await isCacheValid(cacheKey);
    if (!isValid) {
      console.log('⏰ Cache de ordens de serviço expirado ou inexistente');
      return { data: null, fromCache: false };
    }

    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) {
      return { data: null, fromCache: false };
    }

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    
    // Converter datas de string para Date
    const workOrders = parsed.workOrders.map(wo => ({
      ...wo,
      scheduling_date: new Date(wo.scheduling_date),
      createdAt: new Date(wo.createdAt),
      updatedAt: new Date(wo.updatedAt),
    }));

    console.log(`📱 ${workOrders.length} ordens de serviço carregadas do cache${userId ? ` para usuário ${userId}` : ''}`);
    return { data: workOrders, fromCache: true };
  } catch (error) {
    console.error('❌ Erro ao buscar ordens de serviço do cache:', error);
    return { data: null, fromCache: false, error: 'Erro ao acessar cache local' };
  }
};

/**
 * Aplica filtros nas ordens de serviço em cache
 */
export const filterCachedWorkOrders = (
  workOrders: WorkOrder[],
  status?: FilterStatus,
  search?: string
): WorkOrder[] => {
  let filtered = [...workOrders];

  // Filtrar por status
  if (status && status !== 'todas') {
    filtered = filtered.filter(wo => wo.status === status);
  }

  // Filtrar por busca
  if (search && search.trim()) {
    const searchTerm = search.trim().toLowerCase();
    const isNumeric = /^\d+$/.test(searchTerm);

    filtered = filtered.filter(wo => {
      if (isNumeric) {
        // Buscar por ID ou título
        return wo.id.toString().includes(searchTerm) || 
               wo.title.toLowerCase().includes(searchTerm);
      } else {
        // Buscar apenas por título
        return wo.title.toLowerCase().includes(searchTerm);
      }
    });
  }

  return filtered;
};

/**
 * Busca ordens de serviço com cache - tenta cache primeiro, depois servidor
 */
export const getWorkOrdersWithCache = async (
  fetchFunction: () => Promise<{ data: WorkOrder[] | null; error: string | null }>,
  userId?: string,
  status?: FilterStatus,
  search?: string
): Promise<{ data: WorkOrder[] | null; error: string | null; fromCache: boolean }> => {
  try {
    // Verificar conectividade
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();

    // Se offline, SEMPRE tentar buscar do cache, mesmo se expirado
    if (!netInfo.isConnected) {
      console.log('📱 Offline: buscando ordens de serviço do cache (ignorando validade)...');
      
      const cacheKey = userId 
        ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
        : CACHE_KEYS.WORK_ORDERS;

      // Buscar dados do cache diretamente, ignorando validade quando offline
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (cachedData) {
        try {
          const parsed: CachedWorkOrders = JSON.parse(cachedData);
          
          // Converter datas de string para Date
          const workOrders = parsed.workOrders.map(wo => ({
            ...wo,
            scheduling_date: new Date(wo.scheduling_date),
            createdAt: new Date(wo.createdAt),
            updatedAt: new Date(wo.updatedAt),
          }));

          // Aplicar filtros nos dados do cache
          const filteredData = filterCachedWorkOrders(workOrders, status, search);
          console.log(`✅ ${filteredData.length} ordens de serviço filtradas do cache offline (total: ${workOrders.length})`);
          return { data: filteredData, error: null, fromCache: true };
        } catch (parseError) {
          console.error('❌ Erro ao parsear cache offline:', parseError);
        }
      }
      
      console.log('❌ Nenhum dado encontrado no cache offline');
      return { data: [], error: null, fromCache: false };
    }

    // Online: tentar cache primeiro, depois servidor
    console.log('🌐 Online: verificando cache...');
    const cacheResult = await getCachedWorkOrders(userId);
    
    if (cacheResult.fromCache && cacheResult.data) {
      // Aplicar filtros nos dados do cache
      const filteredData = filterCachedWorkOrders(cacheResult.data, status, search);
      console.log(`✅ ${filteredData.length} ordens de serviço filtradas do cache online (total: ${cacheResult.data.length})`);
      return { data: filteredData, error: null, fromCache: true };
    }

    // Cache não disponível ou expirado, buscar do servidor
    console.log('🌐 Buscando ordens de serviço do servidor...');
    const serverResult = await fetchFunction();
    
    if (serverResult.data && !serverResult.error) {
      // Fazer cache dos dados para uso futuro
      await cacheWorkOrders(serverResult.data, userId);
      
      // Aplicar filtros nos dados do servidor
      const filteredData = filterCachedWorkOrders(serverResult.data, status, search);
      console.log(`✅ ${filteredData.length} ordens de serviço filtradas do servidor e salvas no cache (total: ${serverResult.data.length})`);
      return { data: filteredData, error: null, fromCache: false };
    }

    return { ...serverResult, fromCache: false };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar ordens de serviço com cache:', error);
    
    // Em caso de erro, tentar buscar do cache como fallback
    try {
      console.log('🔄 Tentando fallback para cache após erro...');
      const cacheKey = userId 
        ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
        : CACHE_KEYS.WORK_ORDERS;

      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (cachedData) {
        const parsed: CachedWorkOrders = JSON.parse(cachedData);
        
        const workOrders = parsed.workOrders.map(wo => ({
          ...wo,
          scheduling_date: new Date(wo.scheduling_date),
          createdAt: new Date(wo.createdAt),
          updatedAt: new Date(wo.updatedAt),
        }));

        const filteredData = filterCachedWorkOrders(workOrders, status, search);
        console.log(`✅ ${filteredData.length} ordens de serviço do cache fallback`);
        return { data: filteredData, error: null, fromCache: true };
      }
    } catch (fallbackError) {
      console.error('❌ Erro no fallback do cache:', fallbackError);
    }
    
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço', fromCache: false };
  }
};

/**
 * Limpa o cache de ordens de serviço
 */
export const clearWorkOrdersCache = async (userId?: string): Promise<void> => {
  try {
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    await AsyncStorage.removeItem(cacheKey);
    console.log(`🗑️ Cache de ordens de serviço limpo${userId ? ` para usuário ${userId}` : ''}`);
  } catch (error) {
    console.error('❌ Erro ao limpar cache de ordens de serviço:', error);
  }
};

/**
 * Obtém estatísticas do cache
 */
export const getWorkOrdersCacheStats = async (userId?: string): Promise<{
  hasCache: boolean;
  cacheAge: number;
  itemCount: number;
  lastUpdate: string | null;
}> => {
  try {
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) {
      return { hasCache: false, cacheAge: 0, itemCount: 0, lastUpdate: null };
    }

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    const cacheTime = new Date(parsed.timestamp);
    const now = new Date();
    const ageHours = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);

    return {
      hasCache: true,
      cacheAge: Math.round(ageHours * 100) / 100,
      itemCount: parsed.workOrders.length,
      lastUpdate: parsed.timestamp,
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas do cache:', error);
    return { hasCache: false, cacheAge: 0, itemCount: 0, lastUpdate: null };
  }
};

/**
 * Atualiza uma ordem de serviço específica no cache
 */
export const updateWorkOrderInCache = async (
  workOrderId: number,
  updates: Partial<WorkOrder>,
  userId?: string
): Promise<void> => {
  try {
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    // Buscar dados do cache diretamente, sem verificar validade
    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) {
      console.log('⚠️ Nenhum cache encontrado para atualizar');
      return;
    }

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    
    // Converter datas de string para Date
    const workOrders = parsed.workOrders.map(wo => ({
      ...wo,
      scheduling_date: new Date(wo.scheduling_date),
      createdAt: new Date(wo.createdAt),
      updatedAt: new Date(wo.updatedAt),
    }));

    // Atualizar a OS específica
    const updatedWorkOrders = workOrders.map(wo => 
      wo.id === workOrderId ? { ...wo, ...updates } : wo
    );

    // Salvar de volta no cache
    await cacheWorkOrders(updatedWorkOrders, userId);
    console.log(`✅ Ordem de serviço ${workOrderId} atualizada no cache`);
  } catch (error) {
    console.error('❌ Erro ao atualizar ordem de serviço no cache:', error);
  }
};

/**
 * Força o refresh do cache, ignorando validade
 */
export const forceRefreshWorkOrdersCache = async (
  fetchFunction: () => Promise<{ data: WorkOrder[] | null; error: string | null }>,
  userId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('🔄 Forçando refresh do cache de ordens de serviço...');
    
    // Verificar conectividade
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected) {
      console.log('📱 Offline: não é possível forçar refresh do servidor');
      return { success: false, error: 'Sem conexão para atualizar cache' };
    }

    // Buscar dados do servidor
    const serverResult = await fetchFunction();
    
    if (serverResult.data && !serverResult.error) {
      // Atualizar cache com dados frescos
      await cacheWorkOrders(serverResult.data, userId);
      console.log(`✅ Cache atualizado com ${serverResult.data.length} ordens de serviço`);
      return { success: true };
    } else {
      console.error('❌ Erro ao buscar dados do servidor:', serverResult.error);
      return { success: false, error: serverResult.error || 'Erro ao buscar dados' };
    }
  } catch (error) {
    console.error('💥 Erro ao forçar refresh do cache:', error);
    return { success: false, error: 'Erro inesperado ao atualizar cache' };
  }
}; 