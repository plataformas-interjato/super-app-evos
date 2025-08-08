import NetInfo from '@react-native-community/netinfo';
import { WorkOrder, FilterStatus } from '../types/workOrder';
import secureDataStorage from './secureDataStorageService';
import smartOfflineDataService from './smartOfflineDataService';

// REMOVIDO: AsyncStorage - usando apenas FileSystem agora
// import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CachedWorkOrders {
  workOrders: WorkOrder[];
  timestamp: string;
  userId?: string;
}

/**
 * Salva ordens de serviço APENAS no FileSystem (sem AsyncStorage)
 */
export const cacheWorkOrders = async (
  workOrders: WorkOrder[], 
  userId?: string
): Promise<void> => {
  try {
    // ÚNICO MÉTODO: Salvar no smartOfflineDataService FileSystem
    if (userId) {
      try {
        const saveResult = await smartOfflineDataService.saveWorkOrdersToFileSystem(userId, workOrders);
        console.log('🔍 sssssssssssssssssssaveResult:', saveResult);
        console.log('🔍 wwwwwwwwwwwwwwwwwwworkOrders:', workOrders);

        if (!saveResult.success) {
          throw new Error(saveResult.error || 'Erro no FileSystem');
        }
      } catch (filesystemError) {
        throw filesystemError;
      }
    }
    
    // BACKUP: Também salvar no secureDataStorage como backup secundário
    try {
      await secureDataStorage.initialize();
      
      const cacheData: CachedWorkOrders = {
        workOrders,
        timestamp: new Date().toISOString(),
        userId
      };

      const cacheId = userId 
        ? `user_work_orders_${userId}`
        : 'work_orders_global';

      await secureDataStorage.saveData('WORK_ORDERS', [cacheData], cacheId);
    } catch (secureError) {
      // Backup falhou mas não é crítico
    }
    
  } catch (error) {
    throw error;
  }
};

/**
 * Busca ordens de serviço APENAS do FileSystem (sem AsyncStorage)
 */
export const getCachedWorkOrders = async (
  userId?: string
): Promise<{ data: WorkOrder[] | null; fromCache: boolean; error?: string }> => {
  // MÉTODO PRINCIPAL: Buscar do smartOfflineDataService FileSystem
  if (userId) {
    try {
      const filesystemResult = await smartOfflineDataService.getWorkOrdersFromFileSystem(userId);
      
      if (filesystemResult.workOrders && filesystemResult.workOrders.length > 0) {
        console.log(`✅ ${filesystemResult.workOrders.length} ordens carregadas do FileSystem principal`);
        return { 
          data: filesystemResult.workOrders, 
          fromCache: true 
        };
      }
    } catch (filesystemError) {
      console.warn('⚠️ Erro no FileSystem principal:', filesystemError);
      // Continuar para o backup em vez de falhar
    }
  }

  // FALLBACK ÚNICO: Buscar do secureDataStorage backup
  try {
    await secureDataStorage.initialize();
    
    const cacheId = userId 
      ? `user_work_orders_${userId}`
      : 'work_orders_global';

    const secureResult = await secureDataStorage.getData<CachedWorkOrders>('WORK_ORDERS', cacheId);
    
    if (secureResult.data && Array.isArray(secureResult.data) && secureResult.data.length > 0) {
      const cacheData = secureResult.data[0];
      
      if (cacheData.workOrders && Array.isArray(cacheData.workOrders)) {
        const workOrders = cacheData.workOrders.map(wo => ({
          ...wo,
          scheduling_date: new Date(wo.scheduling_date),
          createdAt: new Date(wo.createdAt),
          updatedAt: new Date(wo.updatedAt),
        }));

        console.log(`✅ ${workOrders.length} ordens carregadas do backup secureDataStorage`);

        // Tentar migrar para o FileSystem principal em background
        if (userId) {
          smartOfflineDataService.saveWorkOrdersToFileSystem(userId, workOrders).catch(() => {
            // Falha não crítica
          });
        }
        
        return { data: workOrders, fromCache: true };
      }
    }
  } catch (secureError) {
    console.warn('⚠️ Erro no backup secureDataStorage:', secureError);
    // Não falhar, apenas continuar
  }

  // NENHUM CACHE ENCONTRADO - mas não é erro, é situação normal
  console.log('📭 Nenhum cache encontrado no FileSystem');
  return { 
    data: null, 
    fromCache: false
  };
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

  // Filtro por status
  if (status && status !== 'todas') {
    filtered = filtered.filter(wo => wo.status === status);
  }

  // Filtro de busca
  if (search && search.trim()) {
    const searchLower = search.toLowerCase().trim();
    filtered = filtered.filter(wo => 
      wo.title.toLowerCase().includes(searchLower) ||
      wo.id.toString().includes(searchLower) ||
      wo.client?.toLowerCase().includes(searchLower)
    );
  }

  return filtered;
};

/**
 * Busca ordens de serviço com cache FileSystem - sempre tenta cache primeiro
 */
export const getWorkOrdersWithCache = async (
  fetchFunction: () => Promise<{ data: WorkOrder[] | null; error: string | null }>,
  userId?: string,
  status?: FilterStatus,
  search?: string
): Promise<{ data: WorkOrder[] | null; error: string | null; fromCache: boolean }> => {
  try {
    // Verificar conectividade
    const netInfo = await NetInfo.fetch();
    const isOffline = !netInfo.isConnected;

    // SEMPRE tentar buscar do cache primeiro (APENAS FileSystem)
    const cacheResult = await getCachedWorkOrders(userId);
    
    // Se tem dados no cache, usar sempre (online ou offline)
    if (cacheResult.data && cacheResult.data.length > 0) {
      // Aplicar filtros nos dados do cache
      const filteredData = filterCachedWorkOrders(cacheResult.data, status, search);
      
      console.log(`📁 Cache encontrado: ${cacheResult.data.length} ordens, ${filteredData.length} após filtros`);
      
      // CORREÇÃO: SEMPRE retornar dados do cache quando existem, independente de conexão
      // Se online, atualizar cache em background mas não bloquear o usuário
      if (!isOffline) {
        // Atualizar cache em background (sem bloquear a UI)
        fetchFunction()
          .then(async (serverResult) => {
            if (serverResult.data && !serverResult.error) {
              await cacheWorkOrders(serverResult.data, userId);
            }
          })
          .catch(() => {
            // Falha não crítica
          });
      }
      
      return { data: filteredData, error: null, fromCache: true };
    }

    // Se não há cache E está offline, informar que precisa estar online primeiro
    if (isOffline) {
      console.log('📭 Sem cache e offline - precisa login online primeiro');
      return { 
        data: [], 
        error: null, // Não mostrar erro, apenas lista vazia
        fromCache: false 
      };
    }

    // Se online e sem cache: buscar do servidor
    console.log('🌐 Online sem cache: buscando do servidor...');
    const serverResult = await fetchFunction();
    
    if (serverResult.data && !serverResult.error) {
      // Salvar no cache FileSystem para próximas consultas
      await cacheWorkOrders(serverResult.data, userId);
      
      // Aplicar filtros nos dados do servidor
      const filteredData = filterCachedWorkOrders(serverResult.data, status, search);
      return { data: filteredData, error: null, fromCache: false };
    }

    return { data: null, error: serverResult.error, fromCache: false };
  } catch (error) {
    console.error('❌ Erro em getWorkOrdersWithCache:', error);
    
    // Em caso de erro, tentar carregar cache como último recurso
    try {
      const cacheResult = await getCachedWorkOrders(userId);
      if (cacheResult.data && cacheResult.data.length > 0) {
        const filteredData = filterCachedWorkOrders(cacheResult.data, status, search);
        return { data: filteredData, error: null, fromCache: true };
      }
    } catch (cacheError) {
      // Falha total
    }
    
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço', fromCache: false };
  }
};

/**
 * Limpa o cache de ordens de serviço (APENAS FileSystem)
 */
export const clearWorkOrdersCache = async (userId?: string): Promise<void> => {
  try {
    await secureDataStorage.initialize();
    
    // Limpar do FileSystem principal (smartOfflineDataService)
    if (userId) {
      try {
        // Salvar array vazio para "limpar"
        await smartOfflineDataService.saveWorkOrdersToFileSystem(userId, []);
      } catch (error) {
        // Falha não crítica
      }
    }
    
    // Limpar do backup secureDataStorage
    const cacheId = userId 
      ? `user_work_orders_${userId}`
      : 'work_orders_global';
    
    // Salvar array vazio para "limpar"
    await secureDataStorage.saveData('WORK_ORDERS', [], cacheId);
    
  } catch (error) {
    // Falha não crítica
  }
};

// Funções mantidas para compatibilidade (mas simplificadas para FileSystem)
export const runAutomaticCleanup = async (userId?: string): Promise<void> => {
  // Não necessário no FileSystem
};

export const cacheExists = async (userId?: string): Promise<boolean> => {
  try {
    const result = await getCachedWorkOrders(userId);
    return !!(result.data && result.data.length > 0);
  } catch {
    return false;
  }
};

export const getWorkOrdersCacheStats = async (userId?: string) => {
  try {
    const result = await getCachedWorkOrders(userId);
    
    return {
      hasCache: !!result.data,
      itemCount: result.data?.length || 0,
      cacheAge: 0, // FileSystem não tem expiração
      lastUpdate: new Date().toISOString(),
      cacheSource: 'FileSystem'
    };
  } catch (error) {
    return {
      hasCache: false,
      itemCount: 0,
      cacheAge: 0,
      lastUpdate: null,
      cacheSource: 'none',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

export const updateCacheAfterOSFinalizada = async (workOrderId: number, userId?: string): Promise<void> => {
  try {
    const result = await getCachedWorkOrders(userId);
    
    if (result.data) {
      const updatedWorkOrders = result.data.map(wo => 
        wo.id === workOrderId ? { ...wo, status: 'finalizada' as const } : wo
      );
      
      await cacheWorkOrders(updatedWorkOrders, userId);
    } else {
      // Falha não crítica
    }
  } catch (error) {
    // Falha não crítica
  }
}; 