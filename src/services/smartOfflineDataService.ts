import { supabase } from './supabase';
import NetInfo from '@react-native-community/netinfo';
import secureDataStorage, { OfflineEtapa, OfflineEntradaDados, OfflineTipoOS } from './secureDataStorageService';

/**
 * SERVIÇO INTELIGENTE DE DADOS OFFLINE
 * 
 * Baixa dados do Supabase de forma OTIMIZADA (sem cache full)
 * e armazena no FileSystem usando secureDataStorageService.
 */

export interface OfflineDataSyncStats {
  etapas: number;
  entradas: number;
  tipos: number;
  workOrders: number;
  syncTime: string;
  downloadSizeMB: number;
  userSpecific: boolean;
}

/**
 * DOWNLOAD COMPLETO: Baixa TODAS as etapas/entradas ativas e ordens de serviço do Supabase
 * SEM FILTROS - Para garantir funcionamento offline completo
 */
export const downloadOfflineData = async (userId?: string): Promise<{
  success: boolean;
  stats?: OfflineDataSyncStats;
  error?: string;
}> => {
  
  try {
    // Verificar conectividade
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return { 
        success: false, 
        error: 'Sem conexão para download de dados offline' 
      };
    }

    await secureDataStorage.initialize();
    const startTime = Date.now();
    
    // 1. BAIXAR TODOS OS TIPOS DE OS ATIVOS
    const { data: tiposOs, error: tiposError } = await supabase
      .from('tipo_os')
      .select('*')
      .eq('ativo', 1)
      .order('titulo');
    
    if (tiposError) {
      return { success: false, error: `Erro ao baixar tipos de OS: ${tiposError.message}` };
    }

    // 2. BAIXAR TODAS AS ETAPAS ATIVAS
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('*')
      .eq('ativo', 1)
      .order('tipo_os_id, ordem_etapa');
    
    if (etapasError) {
      return { success: false, error: `Erro ao baixar etapas: ${etapasError.message}` };
    }

    // 3. BAIXAR TODAS AS ENTRADAS ATIVAS
    const { data: entradas, error: entradasError } = await supabase
      .from('entrada_dados')
      .select('*')
      .eq('ativo', 1)
      .order('etapa_os_id, ordem_entrada');
    
    if (entradasError) {
      return { success: false, error: `Erro ao baixar entradas: ${entradasError.message}` };
    }

    // 4. BAIXAR ORDENS DE SERVIÇO DO USUÁRIO
    let workOrders: any[] = [];
    if (userId) {
      try {
        // Tentar diferentes abordagens para encontrar as ordens
        let userWorkOrders = null;
        let workOrdersError = null;
        
        // Tentativa 1: userId como número
        const userIdNum = parseInt(userId);
        const attempt1 = await supabase
          .from('ordem_servico')
          .select('*')
          .eq('usuario_id', userIdNum)
          .order('id', { ascending: false });
        
        if (!attempt1.error && attempt1.data && attempt1.data.length > 0) {
          userWorkOrders = attempt1.data;
        } else {
          // Tentativa 2: userId como string
          const attempt2 = await supabase
            .from('ordem_servico')
            .select('*')
            .eq('usuario_id', userId)
            .order('id', { ascending: false });
          
          if (!attempt2.error && attempt2.data && attempt2.data.length > 0) {
            userWorkOrders = attempt2.data;
          } else {
            // Tentativa 3: campo tecnico_id
            const attempt3 = await supabase
              .from('ordem_servico')
              .select('*')
              .eq('tecnico_id', userIdNum)
              .order('id', { ascending: false });
            
            if (!attempt3.error && attempt3.data && attempt3.data.length > 0) {
              userWorkOrders = attempt3.data;
            } else {
              // Tentativa 4: campo user_id
              const attempt4 = await supabase
                .from('ordem_servico')
                .select('*')
                .eq('user_id', userIdNum)
                .order('id', { ascending: false });
              
              if (!attempt4.error && attempt4.data && attempt4.data.length > 0) {
                userWorkOrders = attempt4.data;
              }
            }
          }
        }
        
        if (userWorkOrders) {
          workOrders = userWorkOrders;
        }
      } catch (queryError) {
        // Falha na query
      }
    }

    // 5. VERIFICAR TAMANHO TOTAL DOS DADOS
    const totalData = {
      tipos: tiposOs || [],
      etapas: etapas || [],
      entradas: entradas || [],
      workOrders: workOrders
    };
    
    const dataString = JSON.stringify(totalData);
    const dataSizeMB = dataString.length / (1024 * 1024);

    // 6. SALVAR NO FILESYSTEM (usando secureDataStorage)
    const syncTime = new Date().toISOString();
    
    // Salvar cada tipo de dado separadamente
    const savePromises = [
      secureDataStorage.saveData('TIPOS_OS', totalData.tipos, 'tipos_os_complete'),
      secureDataStorage.saveData('ETAPAS_OS', totalData.etapas, 'etapas_os_complete'),
      secureDataStorage.saveData('ENTRADAS_DADOS', totalData.entradas, 'entradas_dados_complete')
    ];

    // Salvar ordens de serviço se temos userId
    if (userId && workOrders.length > 0) {
      savePromises.push(
        secureDataStorage.saveData('WORK_ORDERS', workOrders, `work_orders_user_${userId}`)
      );
    }

    const saveResults = await Promise.all(savePromises);

    // Verificar se todos foram salvos com sucesso
    const allSaved = saveResults.every(result => result.success);
    if (!allSaved) {
      return { 
        success: false, 
        error: 'Erro ao salvar dados no FileSystem' 
      };
    }

    // 7. CRIAR CACHES ESPECÍFICOS PARA BUSCA RÁPIDA
    // Cache de etapas por tipo de OS
    const etapasPorTipo: { [key: number]: any[] } = {};
    etapas?.forEach(etapa => {
      if (!etapasPorTipo[etapa.tipo_os_id]) {
        etapasPorTipo[etapa.tipo_os_id] = [];
      }
      etapasPorTipo[etapa.tipo_os_id].push(etapa);
    });

    // Cache de entradas por etapa
    const entradasPorEtapa: { [key: number]: any[] } = {};
    entradas?.forEach(entrada => {
      if (!entradasPorEtapa[entrada.etapa_os_id]) {
        entradasPorEtapa[entrada.etapa_os_id] = [];
      }
      entradasPorEtapa[entrada.etapa_os_id].push(entrada);
    });

    // Salvar caches específicos
    const cachePromises = [
      secureDataStorage.saveData('CACHE_ETAPAS', Object.entries(etapasPorTipo).map(([tipo_os_id, etapas]) => ({
        tipo_os_id: parseInt(tipo_os_id),
        etapas
      })), 'cache_etapas_by_tipo'),
      
      secureDataStorage.saveData('CACHE_ENTRADAS', Object.entries(entradasPorEtapa).map(([etapa_os_id, entradas]) => ({
        etapa_os_id: parseInt(etapa_os_id),
        entradas
      })), 'cache_entradas_by_etapa')
    ];

    await Promise.all(cachePromises);

    const endTime = Date.now();
    const downloadTime = (endTime - startTime) / 1000;

    const stats: OfflineDataSyncStats = {
      tipos: tiposOs?.length || 0,
      etapas: etapas?.length || 0,
      entradas: entradas?.length || 0,
      workOrders: workOrders.length,
      syncTime,
      downloadSizeMB: dataSizeMB,
      userSpecific: !!userId
    };
    
    return { success: true, stats };

  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido no download' 
    };
  }
};

/**
 * BUSCA ETAPAS POR TIPO DE OS (FileSystem completo)
 */
export const getEtapasByTipoOS = async (tipoOsId: number): Promise<{
  etapas: OfflineEtapa[];
  fromCache: boolean;
  error?: string;
}> => {
  try {
    // Buscar no cache específico primeiro (mais rápido)
    const cacheResult = await secureDataStorage.getData<{ tipo_os_id: number; etapas: OfflineEtapa[] }>('CACHE_ETAPAS', 'cache_etapas_by_tipo');
    
    if (cacheResult.data) {
      const tipoCache = cacheResult.data.find(cache => cache.tipo_os_id === tipoOsId);
      if (tipoCache && tipoCache.etapas) {
        return {
          etapas: tipoCache.etapas,
          fromCache: true
        };
      }
    }
    
    // Fallback: buscar nos dados completos
    const completeResult = await secureDataStorage.getData<OfflineEtapa>('ETAPAS_OS', 'etapas_os_complete');
    
    if (completeResult.data) {
      const etapasFiltradas = completeResult.data.filter(etapa => etapa.tipo_os_id === tipoOsId);
      
      return {
        etapas: etapasFiltradas,
        fromCache: false
      };
    }
    
    // Nenhum dado encontrado
    return {
      etapas: [],
      fromCache: false,
      error: 'Nenhuma etapa encontrada offline'
    };
    
  } catch (error) {
    return {
      etapas: [],
      fromCache: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * BUSCA ENTRADAS POR ETAPA (FileSystem completo)
 */
export const getEntradasByEtapa = async (etapaOsId: number): Promise<{
  entradas: OfflineEntradaDados[];
  fromCache: boolean;
  error?: string;
}> => {
  try {
    // Buscar no cache específico primeiro (mais rápido)
    const cacheResult = await secureDataStorage.getData<{ etapa_os_id: number; entradas: OfflineEntradaDados[] }>('CACHE_ENTRADAS', 'cache_entradas_by_etapa');
    
    if (cacheResult.data) {
      const etapaCache = cacheResult.data.find(cache => cache.etapa_os_id === etapaOsId);
      if (etapaCache && etapaCache.entradas) {
        return {
          entradas: etapaCache.entradas,
          fromCache: true
        };
      }
    }
    
    // Fallback: buscar nos dados completos
    const completeResult = await secureDataStorage.getData<OfflineEntradaDados>('ENTRADAS_DADOS', 'entradas_dados_complete');
    
    if (completeResult.data) {
      const entradasFiltradas = completeResult.data.filter(entrada => entrada.etapa_os_id === etapaOsId);
      
      return {
        entradas: entradasFiltradas,
        fromCache: false
      };
    }
    
    // Nenhum dado encontrado
    return {
      entradas: [],
      fromCache: false,
      error: 'Nenhuma entrada encontrada offline'
    };
    
  } catch (error) {
    return {
      entradas: [],
      fromCache: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * BUSCA ORDENS DE SERVIÇO DO FILESYSTEM (offline)
 */
export const getWorkOrdersFromFileSystem = async (userId: string): Promise<{
  workOrders: any[];
  fromCache: boolean;
  error?: string;
}> => {
  try {
    await secureDataStorage.initialize();
    
    // Buscar do FileSystem
    const result = await secureDataStorage.getData('WORK_ORDERS', `work_orders_user_${userId}`);
    
    if (result.data && result.data.length > 0) {
      
      // Converter datas de string para Date se necessário
      const workOrders = result.data.map(wo => ({
        ...wo,
        scheduling_date: new Date(wo.scheduling_date),
        createdAt: new Date(wo.createdAt),
        updatedAt: new Date(wo.updatedAt),
      }));
      
      return {
        workOrders,
        fromCache: true
      };
    }
    
    return {
      workOrders: [],
      fromCache: false,
      error: 'Nenhuma ordem de serviço encontrada offline'
    };
    
  } catch (error) {
    return {
      workOrders: [],
      fromCache: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * SALVA ORDENS DE SERVIÇO NO FILESYSTEM
 */
export const saveWorkOrdersToFileSystem = async (userId: string, workOrders: any[]): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    await secureDataStorage.initialize();
    
    const result = await secureDataStorage.saveData('WORK_ORDERS', workOrders, `work_orders_user_${userId}`);
    
    if (result.success) {
      return { success: true };
    } else {
      return { success: false, error: 'Erro ao salvar no FileSystem' };
    }
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * VERIFICAR SE DADOS ESTÃO FRESCOS (menos de 24h)
 */
export const isOfflineDataFresh = async (): Promise<boolean> => {
  try {
    const etapasResult = await secureDataStorage.getData('ETAPAS_OS', 'etapas_os_complete');
    
    if (etapasResult.metadata) {
      const dataTime = new Date(etapasResult.metadata.timestamp);
      const now = new Date();
      const diffHours = (now.getTime() - dataTime.getTime()) / (1000 * 60 * 60);
      
      return diffHours < 24; // Fresco se menos de 24h
    }
    
    return false;
  } catch (error) {
    return false;
  }
};

/**
 * GARANTIR DISPONIBILIDADE DOS DADOS OFFLINE
 */
export const ensureOfflineDataAvailable = async (userId?: string): Promise<{
  available: boolean;
  fresh: boolean;
  error?: string;
}> => {
  
  try {
    // Verificar se existem dados
    const etapasResult = await secureDataStorage.getData('ETAPAS_OS', 'etapas_os_complete');
    const entradasResult = await secureDataStorage.getData('ENTRADAS_DADOS', 'entradas_dados_complete');
    
    
    const hasData = etapasResult.data && entradasResult.data;
    const isFresh = await isOfflineDataFresh();
    
    // Se não tem dados ou não está fresco, tentar download
    if (!hasData || !isFresh) {
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.isConnected) {
        const downloadResult = await downloadOfflineData(userId);
        
        if (downloadResult.success) {
          return { available: true, fresh: true };
        } else {
          return { 
            available: !!hasData, 
            fresh: false, 
            error: downloadResult.error 
          };
        }
      } else {
        return { 
          available: !!hasData, 
          fresh: false, 
          error: hasData ? undefined : 'Sem dados offline e sem conexão' 
        };
      }
    }
    
    return { available: true, fresh: true };

  } catch (error) {
    return { 
      available: false, 
      fresh: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * DIAGNÓSTICO COMPLETO DO SISTEMA
 */
export const getOfflineDataDiagnostics = async (): Promise<{
  hasEtapas: boolean;
  hasEntradas: boolean;
  hasTipos: boolean;
  lastSync?: string;
  stats?: OfflineDataSyncStats;
  storage: any;
  recommendations: string[];
}> => {
  
  try {
    // Diagnóstico do storage
    const storageDiag = await secureDataStorage.getDiagnostics();
    
    // Verificar dados específicos
    const [etapasResult, entradasResult, tiposResult, workOrdersResult] = await Promise.all([
      secureDataStorage.getData('ETAPAS_OS', 'etapas_os_complete'),
      secureDataStorage.getData('ENTRADAS_DADOS', 'entradas_dados_complete'),
      secureDataStorage.getData('TIPOS_OS', 'tipos_os_complete'),
      secureDataStorage.getData('WORK_ORDERS', 'work_orders_user_1')  
    ]);

    const hasEtapas = !!(etapasResult.data && etapasResult.data.length > 0);
    const hasEntradas = !!(entradasResult.data && entradasResult.data.length > 0);
    const hasTipos = !!(tiposResult.data && tiposResult.data.length > 0);
    
    let stats: OfflineDataSyncStats | undefined;
    let lastSync: string | undefined;
    
    if (etapasResult.metadata) {
      lastSync = etapasResult.metadata.timestamp;
      stats = {
        etapas: etapasResult.data?.length || 0,
        entradas: entradasResult.data?.length || 0,
        tipos: tiposResult.data?.length || 0,
        workOrders: workOrdersResult.data?.length || 0,
        syncTime: lastSync,
        downloadSizeMB: (storageDiag.totalSize / (1024 * 1024)),
        userSpecific: true
      };
    }

    const recommendations: string[] = [...storageDiag.recommendations];
    
    if (!hasEtapas || !hasEntradas) {
      recommendations.unshift('❌ CRÍTICO: Dados offline ausentes - faça login online');
    } else {
      const isFresh = await isOfflineDataFresh();
      if (!isFresh) {
        recommendations.unshift('⏰ Dados offline antigos - sincronize quando online');
      } else {
        recommendations.unshift('✅ Dados offline atualizados e prontos');
      }
    }

    return {
      hasEtapas,
      hasEntradas,
      hasTipos,
      lastSync,
      stats,
      storage: storageDiag,
      recommendations
    };

  } catch (error) {
    return {
      hasEtapas: false,
      hasEntradas: false,
      hasTipos: false,
      storage: null,
      recommendations: ['❌ Erro no diagnóstico dos dados offline']
    };
  }
};

// Default export com todas as funções disponíveis
export default {
  downloadOfflineData,
  ensureOfflineDataAvailable,
  getEtapasByTipoOS,
  getEntradasByEtapa,
  getWorkOrdersFromFileSystem,
  saveWorkOrdersToFileSystem,
  isOfflineDataFresh,
  getOfflineDataDiagnostics
}; 