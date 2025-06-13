import { useState, useEffect, useCallback } from 'react';
import { WorkOrder, FilterStatus } from '../types/workOrder';
import {
  fetchWorkOrders,
  fetchWorkOrdersByTechnician,
  fetchWorkOrdersWithFilters,
  refreshWorkOrdersCache,
  getCacheStats,
  invalidateWorkOrdersCache
} from '../services/workOrderService';

interface UseWorkOrdersCacheState {
  data: WorkOrder[] | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  cacheStats: {
    hasCache: boolean;
    cacheAge: number;
    lastSync: number;
  };
}

interface UseWorkOrdersCacheReturn extends UseWorkOrdersCacheState {
  refresh: () => Promise<void>;
  invalidateCache: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Hook para buscar todas as work orders com cache
 */
export const useWorkOrders = (): UseWorkOrdersCacheReturn => {
  const [state, setState] = useState<UseWorkOrdersCacheState>({
    data: null,
    loading: true,
    error: null,
    fromCache: false,
    cacheStats: { hasCache: false, cacheAge: 0, lastSync: 0 }
  });

  const fetchData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const [result, stats] = await Promise.all([
        fetchWorkOrders(),
        getCacheStats()
      ]);
      
      setState({
        data: result.data,
        loading: false,
        error: result.error,
        fromCache: result.fromCache || false,
        cacheStats: stats
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Erro ao buscar work orders',
        fromCache: false
      }));
    }
  }, []);

  const refresh = useCallback(async () => {
    await refreshWorkOrdersCache();
    await fetchData();
  }, [fetchData]);

  const invalidateCache = useCallback(async () => {
    await invalidateWorkOrdersCache();
    await fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refresh,
    invalidateCache,
    refetch
  };
};

/**
 * Hook para buscar work orders por técnico com cache
 */
export const useWorkOrdersByTechnician = (userId: string): UseWorkOrdersCacheReturn => {
  const [state, setState] = useState<UseWorkOrdersCacheState>({
    data: null,
    loading: true,
    error: null,
    fromCache: false,
    cacheStats: { hasCache: false, cacheAge: 0, lastSync: 0 }
  });

  const fetchData = useCallback(async () => {
    if (!userId) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const [result, stats] = await Promise.all([
        fetchWorkOrdersByTechnician(userId),
        getCacheStats()
      ]);
      
      setState({
        data: result.data,
        loading: false,
        error: result.error,
        fromCache: result.fromCache || false,
        cacheStats: stats
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Erro ao buscar work orders do técnico',
        fromCache: false
      }));
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    await refreshWorkOrdersCache();
    await fetchData();
  }, [fetchData]);

  const invalidateCache = useCallback(async () => {
    await invalidateWorkOrdersCache();
    await fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refresh,
    invalidateCache,
    refetch
  };
};

/**
 * Hook para buscar work orders com filtros e cache
 */
export const useWorkOrdersWithFilters = (
  userId?: string,
  status?: FilterStatus,
  search?: string
): UseWorkOrdersCacheReturn => {
  const [state, setState] = useState<UseWorkOrdersCacheState>({
    data: null,
    loading: true,
    error: null,
    fromCache: false,
    cacheStats: { hasCache: false, cacheAge: 0, lastSync: 0 }
  });

  const fetchData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const [result, stats] = await Promise.all([
        fetchWorkOrdersWithFilters(userId, status, search),
        getCacheStats()
      ]);
      
      setState({
        data: result.data,
        loading: false,
        error: result.error,
        fromCache: result.fromCache || false,
        cacheStats: stats
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Erro ao buscar work orders com filtros',
        fromCache: false
      }));
    }
  }, [userId, status, search]);

  const refresh = useCallback(async () => {
    await refreshWorkOrdersCache();
    await fetchData();
  }, [fetchData]);

  const invalidateCache = useCallback(async () => {
    await invalidateWorkOrdersCache();
    await fetchData();
  }, [fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    ...state,
    refresh,
    invalidateCache,
    refetch
  };
};

/**
 * Hook para gerenciar estatísticas do cache
 */
export const useCacheStats = () => {
  const [stats, setStats] = useState({
    hasCache: false,
    cacheAge: 0,
    lastSync: 0
  });

  const updateStats = useCallback(async () => {
    const newStats = await getCacheStats();
    setStats(newStats);
  }, []);

  useEffect(() => {
    updateStats();
    
    // Atualizar estatísticas a cada 30 segundos
    const interval = setInterval(updateStats, 30000);
    
    return () => clearInterval(interval);
  }, [updateStats]);

  return {
    stats,
    updateStats
  };
}; 