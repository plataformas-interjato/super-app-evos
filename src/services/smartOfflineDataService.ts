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
  syncTime: string;
  downloadSizeMB: number;
  userSpecific: boolean;
}

/**
 * DOWNLOAD COMPLETO: Baixa TODAS as etapas/entradas ativas do Supabase
 * SEM FILTROS - Para garantir funcionamento offline completo
 */
export const downloadOfflineData = async (userId?: string): Promise<{
  success: boolean;
  stats?: OfflineDataSyncStats;
  error?: string;
}> => {
  
  try {
    console.log('🔄 [SMART-OFFLINE] Iniciando download COMPLETO...');
    
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
    console.log('📥 [SMART-OFFLINE] Baixando TODOS os tipos de OS ativos...');
    const { data: tiposOs, error: tiposError } = await supabase
      .from('tipo_os')
      .select('*')
      .eq('ativo', 1)
      .order('id');
    
    if (tiposError) {
      console.error('❌ Erro ao baixar tipos OS:', tiposError);
      return { success: false, error: `Erro ao baixar tipos OS: ${tiposError.message}` };
    }

    console.log(`📊 [SMART-OFFLINE] ${tiposOs?.length || 0} tipos de OS encontrados`);

    // 2. BAIXAR TODAS AS ETAPAS ATIVAS
    console.log('📥 [SMART-OFFLINE] Baixando TODAS as etapas ativas...');
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('*')
      .eq('ativo', 1)
      .order('tipo_os_id, ordem_etapa');
    
    if (etapasError) {
      console.error('❌ Erro ao baixar etapas:', etapasError);
      return { success: false, error: `Erro ao baixar etapas: ${etapasError.message}` };
    }

    console.log(`📊 [SMART-OFFLINE] ${etapas?.length || 0} etapas encontradas`);

    // 3. BAIXAR TODAS AS ENTRADAS ATIVAS
    console.log('📥 [SMART-OFFLINE] Baixando TODAS as entradas ativas...');
    const { data: entradas, error: entradasError } = await supabase
      .from('entrada_dados')
      .select('*')
      .eq('ativo', 1)
      .order('etapa_os_id, ordem_entrada');
    
    if (entradasError) {
      console.error('❌ Erro ao baixar entradas:', entradasError);
      return { success: false, error: `Erro ao baixar entradas: ${entradasError.message}` };
    }

    console.log(`📊 [SMART-OFFLINE] ${entradas?.length || 0} entradas encontradas`);

    // 4. VERIFICAR TAMANHO TOTAL DOS DADOS
    const totalData = {
      tipos: tiposOs || [],
      etapas: etapas || [],
      entradas: entradas || []
    };
    
    const dataString = JSON.stringify(totalData);
    const dataSizeMB = dataString.length / (1024 * 1024);
    
    console.log(`📊 [SMART-OFFLINE] Dados COMPLETOS baixados:`, {
      tipos: tiposOs?.length || 0,
      etapas: etapas?.length || 0,
      entradas: entradas?.length || 0,
      sizeMB: dataSizeMB.toFixed(2)
    });

    // 5. SALVAR NO FILESYSTEM (usando secureDataStorage)
    console.log('💾 [SMART-OFFLINE] Salvando TODOS os dados no FileSystem...');
    
    const syncTime = new Date().toISOString();
    
    // Salvar cada tipo de dado separadamente
    const [tiposResult, etapasResult, entradasResult] = await Promise.all([
      secureDataStorage.saveData('TIPOS_OS', totalData.tipos, 'tipos_os_complete'),
      secureDataStorage.saveData('ETAPAS_OS', totalData.etapas, 'etapas_os_complete'),
      secureDataStorage.saveData('ENTRADAS_DADOS', totalData.entradas, 'entradas_dados_complete')
    ]);

    // Verificar se todos foram salvos com sucesso
    if (!tiposResult.success || !etapasResult.success || !entradasResult.success) {
      console.error('❌ Erro ao salvar dados no FileSystem');
      return { 
        success: false, 
        error: 'Erro ao salvar dados no FileSystem' 
      };
    }

    // 6. CRIAR CACHES ESPECÍFICOS PARA BUSCA RÁPIDA
    console.log('🔧 [SMART-OFFLINE] Criando índices para busca rápida...');
    
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

    // Salvar caches para busca rápida
    await Promise.all([
      secureDataStorage.saveData('CACHE_ETAPAS', Object.keys(etapasPorTipo).map(key => ({
        tipo_os_id: parseInt(key),
        etapas: etapasPorTipo[parseInt(key)]
      })), 'cache_etapas_by_tipo'),
      secureDataStorage.saveData('CACHE_ENTRADAS', Object.keys(entradasPorEtapa).map(key => ({
        etapa_os_id: parseInt(key),
        entradas: entradasPorEtapa[parseInt(key)]
      })), 'cache_entradas_by_etapa')
    ]);

    const endTime = Date.now();
    const stats: OfflineDataSyncStats = {
      etapas: etapas?.length || 0,
      entradas: entradas?.length || 0,
      tipos: tiposOs?.length || 0,
      syncTime,
      downloadSizeMB: dataSizeMB,
      userSpecific: false // Download completo para todos
    };

    console.log(`✅ [SMART-OFFLINE] Download COMPLETO concluído em ${endTime - startTime}ms:`, stats);
    
    return { success: true, stats };

  } catch (error) {
    console.error('💥 [SMART-OFFLINE] Erro no download completo:', error);
    return { 
      success: false, 
      error: `Erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
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
    console.log(`🔍 [SMART-OFFLINE] Buscando etapas para tipo OS ${tipoOsId}...`);
    
    // Buscar no cache específico primeiro (mais rápido)
    const cacheResult = await secureDataStorage.getData<{ tipo_os_id: number; etapas: OfflineEtapa[] }>('CACHE_ETAPAS', 'cache_etapas_by_tipo');
    
    if (cacheResult.data) {
      const tipoCache = cacheResult.data.find(cache => cache.tipo_os_id === tipoOsId);
      if (tipoCache && tipoCache.etapas) {
        console.log(`✅ [SMART-OFFLINE] ${tipoCache.etapas.length} etapas encontradas no cache`);
        return {
          etapas: tipoCache.etapas,
          fromCache: true
        };
      }
    }
    
    // Fallback: buscar nos dados completos
    console.log(`🔄 [SMART-OFFLINE] Cache não encontrado, buscando nos dados completos...`);
    const completeResult = await secureDataStorage.getData<OfflineEtapa>('ETAPAS_OS', 'etapas_os_complete');
    
    if (completeResult.data) {
      const etapasFiltradas = completeResult.data.filter(etapa => etapa.tipo_os_id === tipoOsId);
      console.log(`✅ [SMART-OFFLINE] ${etapasFiltradas.length} etapas encontradas nos dados completos`);
      
      return {
        etapas: etapasFiltradas,
        fromCache: false
      };
    }
    
    // Nenhum dado encontrado
    console.warn(`⚠️ [SMART-OFFLINE] Nenhuma etapa encontrada para tipo OS ${tipoOsId}`);
    return {
      etapas: [],
      fromCache: false,
      error: 'Nenhuma etapa encontrada offline'
    };
    
  } catch (error) {
    console.error(`❌ [SMART-OFFLINE] Erro ao buscar etapas:`, error);
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
    console.log(`🔍 [SMART-OFFLINE] Buscando entradas para etapa ${etapaOsId}...`);
    
    // Buscar no cache específico primeiro (mais rápido)
    const cacheResult = await secureDataStorage.getData<{ etapa_os_id: number; entradas: OfflineEntradaDados[] }>('CACHE_ENTRADAS', 'cache_entradas_by_etapa');
    
    if (cacheResult.data) {
      const etapaCache = cacheResult.data.find(cache => cache.etapa_os_id === etapaOsId);
      if (etapaCache && etapaCache.entradas) {
        console.log(`✅ [SMART-OFFLINE] ${etapaCache.entradas.length} entradas encontradas no cache`);
        return {
          entradas: etapaCache.entradas,
          fromCache: true
        };
      }
    }
    
    // Fallback: buscar nos dados completos
    console.log(`🔄 [SMART-OFFLINE] Cache não encontrado, buscando nos dados completos...`);
    const completeResult = await secureDataStorage.getData<OfflineEntradaDados>('ENTRADAS_DADOS', 'entradas_dados_complete');
    
    if (completeResult.data) {
      const entradasFiltradas = completeResult.data.filter(entrada => entrada.etapa_os_id === etapaOsId);
      console.log(`✅ [SMART-OFFLINE] ${entradasFiltradas.length} entradas encontradas nos dados completos`);
      
      return {
        entradas: entradasFiltradas,
        fromCache: false
      };
    }
    
    // Nenhum dado encontrado
    console.warn(`⚠️ [SMART-OFFLINE] Nenhuma entrada encontrada para etapa ${etapaOsId}`);
    return {
      entradas: [],
      fromCache: false,
      error: 'Nenhuma entrada encontrada offline'
    };
    
  } catch (error) {
    console.error(`❌ [SMART-OFFLINE] Erro ao buscar entradas:`, error);
    return {
      entradas: [],
      fromCache: false,
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
    console.error('❌ Erro ao verificar frescor dos dados:', error);
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
    console.log('🔄 [SMART-OFFLINE] Verificando disponibilidade de dados...');
    
    // Verificar se existem dados
    const etapasResult = await secureDataStorage.getData('ETAPAS_OS', 'etapas_os_complete');
    const entradasResult = await secureDataStorage.getData('ENTRADAS_DADOS', 'entradas_dados_complete');
    
    const hasData = etapasResult.data && entradasResult.data;
    const isFresh = await isOfflineDataFresh();
    
    console.log(`📊 [SMART-OFFLINE] Status: hasData=${!!hasData}, isFresh=${isFresh}`);
    
    // Se não tem dados ou não está fresco, tentar download
    if (!hasData || !isFresh) {
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.isConnected) {
        console.log('🌐 [SMART-OFFLINE] Fazendo download de dados frescos...');
        const downloadResult = await downloadOfflineData(userId);
        
        if (downloadResult.success) {
          console.log('✅ [SMART-OFFLINE] Dados atualizados com sucesso');
          return { available: true, fresh: true };
        } else {
          console.warn('⚠️ [SMART-OFFLINE] Falha no download, usando cache se disponível');
          return { 
            available: !!hasData, 
            fresh: false, 
            error: downloadResult.error 
          };
        }
      } else {
        console.log('📱 [SMART-OFFLINE] Offline - usando dados em cache se disponível');
        return { 
          available: !!hasData, 
          fresh: false, 
          error: hasData ? undefined : 'Sem dados offline e sem conexão' 
        };
      }
    }
    
    console.log('✅ [SMART-OFFLINE] Dados offline disponíveis e frescos');
    return { available: true, fresh: true };

  } catch (error) {
    console.error('💥 [SMART-OFFLINE] Erro ao garantir dados offline:', error);
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
    const [etapasResult, entradasResult, tiposResult] = await Promise.all([
      secureDataStorage.getData('ETAPAS_OS', 'etapas_os_complete'),
      secureDataStorage.getData('ENTRADAS_DADOS', 'entradas_dados_complete'),
      secureDataStorage.getData('TIPOS_OS', 'tipos_os_complete')
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
    console.error('💥 [SMART-OFFLINE] Erro no diagnóstico:', error);
    return {
      hasEtapas: false,
      hasEntradas: false,
      hasTipos: false,
      storage: null,
      recommendations: ['❌ Erro no diagnóstico dos dados offline']
    };
  }
};

export default {
  downloadOfflineData,
  ensureOfflineDataAvailable,
  getEtapasByTipoOS,
  getEntradasByEtapa,
  isOfflineDataFresh,
  getOfflineDataDiagnostics
}; 