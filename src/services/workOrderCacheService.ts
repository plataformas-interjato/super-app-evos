import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkOrder, FilterStatus } from '../types/workOrder';

const CACHE_KEYS = {
  WORK_ORDERS: 'cached_work_orders',
  CACHE_TIMESTAMP: 'work_orders_cache_timestamp',
  USER_WORK_ORDERS: 'cached_user_work_orders_', // Será concatenado com userId
  CLEANUP_TIMESTAMP: 'cache_cleanup_timestamp', // Para controlar limpeza automática
};

// Cache permanente - sem expiração por tempo
// const CACHE_EXPIRY_HOURS = 24; // REMOVIDO - cache agora é permanente

// Configuração para limpeza de OS concluídas
const COMPLETED_OS_CLEANUP_DAYS = 7; // OS concluídas são removidas após 7 dias
const CLEANUP_CHECK_INTERVAL_HOURS = 6; // Verificar limpeza a cada 6 horas

export interface CachedWorkOrders {
  workOrders: WorkOrder[];
  timestamp: string;
  userId?: string;
}

/**
 * Verifica se precisa executar limpeza automática
 */
const shouldRunCleanup = async (): Promise<boolean> => {
  try {
    const lastCleanup = await AsyncStorage.getItem(CACHE_KEYS.CLEANUP_TIMESTAMP);
    if (!lastCleanup) return true;

    const lastCleanupTime = new Date(lastCleanup);
    const now = new Date();
    const diffHours = (now.getTime() - lastCleanupTime.getTime()) / (1000 * 60 * 60);

    return diffHours >= CLEANUP_CHECK_INTERVAL_HOURS;
  } catch (error) {
    console.error('❌ Erro ao verificar necessidade de limpeza:', error);
    return true; // Em caso de erro, executar limpeza
  }
};

/**
 * Remove OS concluídas (finalizadas/canceladas) que estão há mais de 7 dias
 */
const cleanupCompletedWorkOrders = async (workOrders: WorkOrder[]): Promise<WorkOrder[]> => {
  try {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (COMPLETED_OS_CLEANUP_DAYS * 24 * 60 * 60 * 1000));

    const filteredWorkOrders = workOrders.filter(wo => {
      // Manter OS que não estão concluídas
      if (wo.status !== 'finalizada' && wo.status !== 'cancelada') {
        return true;
      }

      // Para OS concluídas, verificar se foram atualizadas há menos de 7 dias
      const updatedAt = new Date(wo.updatedAt);
      const shouldKeep = updatedAt > cutoffDate;

      if (!shouldKeep) {
        console.log(`🗑️ Removendo OS ${wo.id} (${wo.status}) - concluída há mais de 7 dias`);
      }

      return shouldKeep;
    });

    const removedCount = workOrders.length - filteredWorkOrders.length;
    if (removedCount > 0) {
      console.log(`✅ Limpeza automática: ${removedCount} OS concluídas removidas do cache`);
    }

    return filteredWorkOrders;
  } catch (error) {
    console.error('❌ Erro na limpeza automática:', error);
    return workOrders; // Em caso de erro, retornar dados originais
  }
};

/**
 * Executa limpeza automática se necessário
 */
const runAutomaticCleanup = async (userId?: string): Promise<void> => {
  try {
    if (!(await shouldRunCleanup())) {
      return;
    }

    console.log('🧹 Executando limpeza automática do cache...');

    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) return;

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    const cleanedWorkOrders = await cleanupCompletedWorkOrders(parsed.workOrders);

    // Salvar dados limpos de volta no cache
    const updatedCacheData: CachedWorkOrders = {
      ...parsed,
      workOrders: cleanedWorkOrders,
      timestamp: new Date().toISOString(), // Atualizar timestamp
    };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(updatedCacheData));

    // Marcar timestamp da última limpeza
    await AsyncStorage.setItem(CACHE_KEYS.CLEANUP_TIMESTAMP, new Date().toISOString());

    console.log('✅ Limpeza automática concluída');
  } catch (error) {
    console.error('❌ Erro na limpeza automática:', error);
  }
};

/**
 * Verifica se o cache existe (sem validação de expiração)
 */
const cacheExists = async (cacheKey: string): Promise<boolean> => {
  try {
    const cachedData = await AsyncStorage.getItem(cacheKey);
    return cachedData !== null;
  } catch (error) {
    console.error('❌ Erro ao verificar existência do cache:', error);
    return false;
  }
};

/**
 * Salva ordens de serviço no cache local (permanente)
 */
export const cacheWorkOrders = async (
  workOrders: WorkOrder[],
  userId?: string
): Promise<void> => {
  try {
    // Executar limpeza automática antes de salvar novos dados
    await runAutomaticCleanup(userId);

    const cacheData: CachedWorkOrders = {
      workOrders,
      timestamp: new Date().toISOString(),
      userId,
    };

    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`✅ ${workOrders.length} ordens de serviço salvas no cache permanente${userId ? ` para usuário ${userId}` : ''}`);
  } catch (error) {
    console.error('❌ Erro ao salvar ordens de serviço no cache:', error);
  }
};

/**
 * Busca ordens de serviço do cache local (permanente)
 */
export const getCachedWorkOrders = async (
  userId?: string
): Promise<{ data: WorkOrder[] | null; fromCache: boolean; error?: string }> => {
  try {
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    // Verificar se o cache existe (sem validação de expiração)
    const exists = await cacheExists(cacheKey);
    if (!exists) {
      console.log('📭 Cache de ordens de serviço não encontrado');
      return { data: null, fromCache: false };
    }

    // Executar limpeza automática antes de retornar dados
    await runAutomaticCleanup(userId);

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

    console.log(`📱 ${workOrders.length} ordens de serviço carregadas do cache permanente${userId ? ` para usuário ${userId}` : ''}`);
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
 * Busca ordens de serviço com cache permanente - sempre tenta cache primeiro
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

    // SEMPRE tentar buscar do cache primeiro (online ou offline)
    console.log('📱 Buscando ordens de serviço do cache permanente...');
    
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    // Buscar dados do cache
    const cachedData = await AsyncStorage.getItem(cacheKey);
    
    if (cachedData) {
      try {
        // Executar limpeza automática
        await runAutomaticCleanup(userId);
        
        // Recarregar dados após limpeza
        const cleanedData = await AsyncStorage.getItem(cacheKey);
        if (cleanedData) {
          const parsed: CachedWorkOrders = JSON.parse(cleanedData);
          
          // Converter datas de string para Date
          const workOrders = parsed.workOrders.map(wo => ({
            ...wo,
            scheduling_date: new Date(wo.scheduling_date),
            createdAt: new Date(wo.createdAt),
            updatedAt: new Date(wo.updatedAt),
          }));

          // Aplicar filtros nos dados do cache
          const filteredData = filterCachedWorkOrders(workOrders, status, search);
          console.log(`✅ ${filteredData.length} ordens de serviço filtradas do cache permanente (total: ${workOrders.length})`);
          
          // Se offline, retornar dados do cache
          if (!netInfo.isConnected) {
            console.log('📱 Offline: usando dados do cache permanente');
            return { data: filteredData, error: null, fromCache: true };
          }
          
          // Se online, retornar dados do cache mas também tentar atualizar em background
          console.log('🌐 Online: usando cache permanente e atualizando em background');
          
          // Atualizar cache em background (sem bloquear a UI)
          fetchFunction()
            .then(async (serverResult) => {
              if (serverResult.data && !serverResult.error) {
                await cacheWorkOrders(serverResult.data, userId);
                console.log('🔄 Cache atualizado em background com dados do servidor');
              }
            })
            .catch((error) => {
              console.log('⚠️ Erro ao atualizar cache em background:', error);
            });
          
          return { data: filteredData, error: null, fromCache: true };
        }
      } catch (parseError) {
        console.error('❌ Erro ao processar cache:', parseError);
      }
    }
    
    // Se não há cache ou erro no cache, tentar servidor (apenas se online)
    if (!netInfo.isConnected) {
      console.log('❌ Offline e sem cache disponível');
      return { data: [], error: null, fromCache: false };
    }

    // Online sem cache: buscar do servidor
    console.log('🌐 Online sem cache: buscando do servidor...');
    const serverResult = await fetchFunction();
    
    if (serverResult.data && !serverResult.error) {
      // Salvar no cache para próximas consultas
      await cacheWorkOrders(serverResult.data, userId);
      
      // Aplicar filtros nos dados do servidor
      const filteredData = filterCachedWorkOrders(serverResult.data, status, search);
      console.log(`✅ ${filteredData.length} ordens de serviço filtradas do servidor (total: ${serverResult.data.length})`);
      return { data: filteredData, error: null, fromCache: false };
    }

    return { data: null, error: serverResult.error, fromCache: false };
  } catch (error) {
    console.error('❌ Erro em getWorkOrdersWithCache:', error);
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
 * Força limpeza manual de OS concluídas
 */
export const forceCleanupCompletedWorkOrders = async (userId?: string): Promise<{
  success: boolean;
  removedCount: number;
  error?: string;
}> => {
  try {
    console.log('🧹 Executando limpeza manual de OS concluídas...');

    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    const cachedData = await AsyncStorage.getItem(cacheKey);
    if (!cachedData) {
      return { success: true, removedCount: 0 };
    }

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    const originalCount = parsed.workOrders.length;
    const cleanedWorkOrders = await cleanupCompletedWorkOrders(parsed.workOrders);
    const removedCount = originalCount - cleanedWorkOrders.length;

    // Salvar dados limpos de volta no cache
    const updatedCacheData: CachedWorkOrders = {
      ...parsed,
      workOrders: cleanedWorkOrders,
      timestamp: new Date().toISOString(),
    };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(updatedCacheData));
    await AsyncStorage.setItem(CACHE_KEYS.CLEANUP_TIMESTAMP, new Date().toISOString());

    console.log(`✅ Limpeza manual concluída: ${removedCount} OS removidas`);
    return { success: true, removedCount };
  } catch (error) {
    console.error('❌ Erro na limpeza manual:', error);
    return { success: false, removedCount: 0, error: 'Erro ao executar limpeza manual' };
  }
};

/**
 * Obtém estatísticas detalhadas do cache permanente
 */
export const getWorkOrdersCacheStats = async (userId?: string): Promise<{
  hasCache: boolean;
  cacheAge: number;
  itemCount: number;
  completedCount: number;
  activeCount: number;
  lastUpdate: string | null;
  lastCleanup: string | null;
  nextCleanupDue: boolean;
}> => {
  try {
    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    const cachedData = await AsyncStorage.getItem(cacheKey);
    const lastCleanup = await AsyncStorage.getItem(CACHE_KEYS.CLEANUP_TIMESTAMP);
    
    if (!cachedData) {
      return {
        hasCache: false,
        cacheAge: 0,
        itemCount: 0,
        completedCount: 0,
        activeCount: 0,
        lastUpdate: null,
        lastCleanup,
        nextCleanupDue: true,
      };
    }

    const parsed: CachedWorkOrders = JSON.parse(cachedData);
    const cacheTime = new Date(parsed.timestamp);
    const now = new Date();
    const ageHours = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);

    // Contar OS por status
    const completedCount = parsed.workOrders.filter(wo => 
      wo.status === 'finalizada' || wo.status === 'cancelada'
    ).length;
    const activeCount = parsed.workOrders.length - completedCount;

    // Verificar se próxima limpeza é necessária
    const nextCleanupDue = await shouldRunCleanup();

    return {
      hasCache: true,
      cacheAge: Math.round(ageHours * 100) / 100,
      itemCount: parsed.workOrders.length,
      completedCount,
      activeCount,
      lastUpdate: parsed.timestamp,
      lastCleanup,
      nextCleanupDue,
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas do cache:', error);
    return {
      hasCache: false,
      cacheAge: 0,
      itemCount: 0,
      completedCount: 0,
      activeCount: 0,
      lastUpdate: null,
      lastCleanup: null,
      nextCleanupDue: true,
    };
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

/**
 * Atualiza cache de forma inteligente após finalização de OS online
 * Preserva OS em andamento para não perder progresso
 */
export const updateCacheAfterOSFinalizada = async (
  finalizadaWorkOrderId: number,
  fetchFunction: () => Promise<{ data: WorkOrder[] | null; error: string | null }>,
  userId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log(`🔄 Atualizando cache após OS ${finalizadaWorkOrderId} finalizada online...`);
    
    // Verificar conectividade
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected) {
      console.log('📱 Offline: não é possível atualizar cache do servidor');
      return { success: false, error: 'Sem conexão para atualizar cache' };
    }

    const cacheKey = userId 
      ? `${CACHE_KEYS.USER_WORK_ORDERS}${userId}`
      : CACHE_KEYS.WORK_ORDERS;

    // 1. Buscar dados atuais do cache
    const cachedData = await AsyncStorage.getItem(cacheKey);
    let osEmAndamento: WorkOrder[] = [];
    
    if (cachedData) {
      try {
        const parsed: CachedWorkOrders = JSON.parse(cachedData);
        
        // Converter datas e filtrar OS em andamento (exceto a que foi finalizada)
        osEmAndamento = parsed.workOrders
          .map(wo => ({
            ...wo,
            scheduling_date: new Date(wo.scheduling_date),
            createdAt: new Date(wo.createdAt),
            updatedAt: new Date(wo.updatedAt),
          }))
          .filter(wo => 
            wo.status === 'em_progresso' && 
            wo.id !== finalizadaWorkOrderId
          );
        
        console.log(`📱 Preservando ${osEmAndamento.length} OS em andamento no cache`);
      } catch (parseError) {
        console.error('❌ Erro ao parsear cache atual:', parseError);
      }
    }

    // 2. Buscar dados frescos do servidor
    console.log('🌐 Buscando dados frescos do servidor...');
    const serverResult = await fetchFunction();
    
    if (serverResult.data && !serverResult.error) {
      // 3. Mesclar dados: servidor + OS em andamento preservadas
      const dadosDoServidor = serverResult.data;
      
      // Remover do servidor as OS em andamento que já temos no cache
      const idsEmAndamento = osEmAndamento.map(wo => wo.id);
      const dadosServidorFiltrados = dadosDoServidor.filter(wo => 
        !idsEmAndamento.includes(wo.id)
      );
      
      // Combinar dados
      const dadosCombinados = [...dadosServidorFiltrados, ...osEmAndamento];
      
      console.log(`✅ Cache atualizado: ${dadosServidorFiltrados.length} do servidor + ${osEmAndamento.length} em andamento preservadas`);
      
      // 4. Salvar cache atualizado
      await cacheWorkOrders(dadosCombinados, userId);
      
      return { success: true };
    } else {
      console.error('❌ Erro ao buscar dados do servidor:', serverResult.error);
      return { success: false, error: serverResult.error || 'Erro ao buscar dados' };
    }
  } catch (error) {
    console.error('💥 Erro ao atualizar cache após OS finalizada:', error);
    return { success: false, error: 'Erro inesperado ao atualizar cache' };
  }
}; 