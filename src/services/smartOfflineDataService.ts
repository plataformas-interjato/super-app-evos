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
 * DOWNLOAD INTELIGENTE: Baixa apenas dados relevantes para o usuário
 * EVITA cache full baixando só o necessário e salvando no FileSystem
 */
export const downloadOfflineData = async (userId?: string): Promise<{
  success: boolean;
  stats?: OfflineDataSyncStats;
  error?: string;
}> => {
  
  try {
    console.log('🔄 [SMART-OFFLINE] Iniciando download inteligente...');
    
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
    
    // 1. DESCOBRIR TIPOS DE OS RELEVANTES PARA O USUÁRIO
    console.log('📥 [SMART-OFFLINE] Descobrindo tipos de OS relevantes...');
    let tiposRelevantes: number[] = [];
    let userSpecific = false;
    
    if (userId) {
      // Buscar tipos de OS das ordens do usuário (últimos 6 meses)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const { data: userOrders } = await supabase
        .from('ordem_servico')
        .select('tipo_os_id')
        .eq('tecnico_resp_id', parseInt(userId))
        .eq('ativo', 1)
        .gte('created_at', sixMonthsAgo.toISOString());
      
      if (userOrders && userOrders.length > 0) {
        tiposRelevantes = Array.from(new Set(userOrders.map(o => o.tipo_os_id).filter(Boolean)));
        userSpecific = true;
        console.log(`📊 [SMART-OFFLINE] Usuário trabalha com ${tiposRelevantes.length} tipos de OS:`, tiposRelevantes);
      }
    }
    
    // FALLBACK: Se não temos dados do usuário, baixar tipos mais usados
    if (tiposRelevantes.length === 0) {
      console.log('📥 [SMART-OFFLINE] Buscando tipos de OS mais utilizados...');
      
      // Buscar tipos com mais ordens de serviço ativas
      const { data: popularTypes } = await supabase
        .from('tipo_os')
        .select(`
          id,
          titulo,
          ordem_servico!inner(id)
        `)
        .eq('ativo', 1)
        .eq('ordem_servico.ativo', 1)
        .order('id', { ascending: true })
        .limit(5); // Máximo 5 tipos mais populares
      
      tiposRelevantes = popularTypes?.map(t => t.id) || [];
      console.log(`📊 [SMART-OFFLINE] Usando ${tiposRelevantes.length} tipos populares:`, tiposRelevantes);
    }

    // PROTEÇÃO: Limitar a 10 tipos no máximo
    if (tiposRelevantes.length > 10) {
      tiposRelevantes = tiposRelevantes.slice(0, 10);
      console.log(`⚠️ [SMART-OFFLINE] Limitando a 10 tipos por segurança`);
    }

    // 2. BAIXAR TIPOS DE OS RELEVANTES
    console.log('📥 [SMART-OFFLINE] Baixando tipos de OS...');
    const { data: tiposOs, error: tiposError } = await supabase
      .from('tipo_os')
      .select('*')
      .in('id', tiposRelevantes)
      .eq('ativo', 1);
    
    if (tiposError) {
      console.error('❌ Erro ao baixar tipos OS:', tiposError);
      return { success: false, error: `Erro ao baixar tipos OS: ${tiposError.message}` };
    }

    // 3. BAIXAR ETAPAS DOS TIPOS RELEVANTES
    console.log('📥 [SMART-OFFLINE] Baixando etapas relevantes...');
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('*')
      .in('tipo_os_id', tiposRelevantes) // ← FILTRO INTELIGENTE
      .eq('ativo', 1)
      .order('tipo_os_id, ordem_etapa')
      .limit(200); // ← LIMITE DE SEGURANÇA
    
    if (etapasError) {
      console.error('❌ Erro ao baixar etapas:', etapasError);
      return { success: false, error: `Erro ao baixar etapas: ${etapasError.message}` };
    }

    // 4. BAIXAR ENTRADAS DAS ETAPAS RELEVANTES
    const etapaIds = etapas?.map(e => e.id) || [];
    console.log(`📥 [SMART-OFFLINE] Baixando entradas de ${etapaIds.length} etapas...`);
    
    let entradas: any[] = [];
    if (etapaIds.length > 0) {
      // PROCESSAMENTO EM LOTES para evitar URL muito longa
      const batchSize = 50;
      
      for (let i = 0; i < etapaIds.length; i += batchSize) {
        const batch = etapaIds.slice(i, i + batchSize);
        
        console.log(`📥 [SMART-OFFLINE] Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(etapaIds.length/batchSize)}`);
        
        const { data: batchEntradas, error: entradasError } = await supabase
          .from('entrada_dados')
          .select('*')
          .in('etapa_os_id', batch) // ← FILTRO INTELIGENTE
          .eq('ativo', 1)
          .order('etapa_os_id, ordem_entrada')
          .limit(500); // ← LIMITE POR LOTE
        
        if (entradasError) {
          console.error('❌ Erro ao baixar entradas lote:', entradasError);
          return { success: false, error: `Erro ao baixar entradas: ${entradasError.message}` };
        }
        
        entradas = entradas.concat(batchEntradas || []);
        console.log(`📥 [SMART-OFFLINE] Lote processado: +${batchEntradas?.length || 0} entradas`);
      }
    }

    // 5. VERIFICAR TAMANHO TOTAL DOS DADOS
    const totalData = {
      tipos: tiposOs || [],
      etapas: etapas || [],
      entradas: entradas
    };
    
    const dataString = JSON.stringify(totalData);
    const dataSizeMB = dataString.length / (1024 * 1024);
    
    console.log(`📊 [SMART-OFFLINE] Dados baixados:`, {
      tipos: tiposOs?.length || 0,
      etapas: etapas?.length || 0,
      entradas: entradas.length,
      sizeMB: dataSizeMB.toFixed(2)
    });

    // PROTEÇÃO: Se muito grande, reduzir ainda mais
    if (dataSizeMB > 10) { // Limite 10MB
      console.warn('⚠️ [SMART-OFFLINE] Dados muito grandes, aplicando redução drástica...');
      
      // Manter apenas dados mais essenciais
      const etapasReduzidas = etapas?.slice(0, 50) || []; // Máximo 50 etapas
      const etapaIdsReduzidos = etapasReduzidas.map(e => e.id);
      const entradasReduzidas = entradas.filter(e => etapaIdsReduzidos.includes(e.etapa_os_id)).slice(0, 100);
      
      totalData.etapas = etapasReduzidas;
      totalData.entradas = entradasReduzidas;
      
      const newSize = JSON.stringify(totalData).length / (1024 * 1024);
      console.log(`📊 [SMART-OFFLINE] Tamanho após redução: ${newSize.toFixed(2)} MB`);
    }

    // 6. SALVAR NO FILESYSTEM (usando secureDataStorage)
    console.log('💾 [SMART-OFFLINE] Salvando dados no FileSystem...');
    
    const syncTime = new Date().toISOString();
    
    // Salvar cada tipo de dado separadamente
    const [tiposResult, etapasResult, entradasResult] = await Promise.all([
      secureDataStorage.saveData('TIPOS_OS', totalData.tipos, 'tipos_os_current'),
      secureDataStorage.saveData('ETAPAS_OS', totalData.etapas, 'etapas_os_current'),
      secureDataStorage.saveData('ENTRADAS_DADOS', totalData.entradas, 'entradas_dados_current')
    ]);

    // Verificar se algum falhou
    if (!tiposResult.success || !etapasResult.success || !entradasResult.success) {
      const errors = [
        !tiposResult.success ? `Tipos: ${tiposResult.error}` : null,
        !etapasResult.success ? `Etapas: ${etapasResult.error}` : null,
        !entradasResult.success ? `Entradas: ${entradasResult.error}` : null
      ].filter(Boolean);
      
      return { 
        success: false, 
        error: `Erro ao salvar dados: ${errors.join(', ')}` 
      };
    }

    // 7. CRIAR CACHES ESPECÍFICOS POR TIPO
    console.log('🔄 [SMART-OFFLINE] Criando caches específicos...');
    
    for (const tipoId of tiposRelevantes) {
      // Cache de etapas por tipo
      const etapasTipo = totalData.etapas.filter(e => e.tipo_os_id === tipoId);
      if (etapasTipo.length > 0) {
        await secureDataStorage.saveData('CACHE_ETAPAS', etapasTipo, `cache_etapas_tipo_${tipoId}`);
        
        // Cache de entradas para essas etapas
        const etapaIdsTipo = etapasTipo.map(e => e.id);
        const entradasTipo = totalData.entradas.filter(ent => etapaIdsTipo.includes(ent.etapa_os_id));
        
        for (const etapaId of etapaIdsTipo) {
          const entradasEtapa = entradasTipo.filter(ent => ent.etapa_os_id === etapaId);
          if (entradasEtapa.length > 0) {
            await secureDataStorage.saveData('CACHE_ENTRADAS', entradasEtapa, `cache_entradas_etapa_${etapaId}`);
          }
        }
      }
    }

    const endTime = Date.now();
    const stats: OfflineDataSyncStats = {
      etapas: totalData.etapas.length,
      entradas: totalData.entradas.length,
      tipos: totalData.tipos.length,
      syncTime,
      downloadSizeMB: parseFloat(dataSizeMB.toFixed(2)),
      userSpecific
    };

    console.log(`✅ [SMART-OFFLINE] Download concluído em ${endTime - startTime}ms:`, stats);
    
    return { success: true, stats };

  } catch (error) {
    console.error('💥 [SMART-OFFLINE] Erro no download:', error);
    return { 
      success: false, 
      error: `Erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
    };
  }
};

/**
 * BUSCA INTELIGENTE: Etapas por tipo de OS (FileSystem-first)
 */
export const getEtapasByTipoOS = async (tipoOsId: number): Promise<{
  etapas: OfflineEtapa[];
  fromCache: boolean;
  error?: string;
}> => {
  
  try {
    console.log(`🔍 [SMART-OFFLINE] Buscando etapas do tipo OS ${tipoOsId}...`);
    
    // Usar secureDataStorage
    const result = await secureDataStorage.getEtapasByTipoOS(tipoOsId);
    
    return {
      etapas: result.etapas,
      fromCache: result.fromCache,
      error: result.error
    };

  } catch (error) {
    console.error(`💥 [SMART-OFFLINE] Erro ao buscar etapas do tipo ${tipoOsId}:`, error);
    return {
      etapas: [],
      fromCache: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * BUSCA INTELIGENTE: Entradas de dados por etapa (FileSystem-first)
 */
export const getEntradasByEtapa = async (etapaOsId: number): Promise<{
  entradas: OfflineEntradaDados[];
  fromCache: boolean;
  error?: string;
}> => {
  
  try {
    console.log(`🔍 [SMART-OFFLINE] Buscando entradas da etapa ${etapaOsId}...`);
    
    // Usar secureDataStorage
    const result = await secureDataStorage.getEntradasByEtapa(etapaOsId);
    
    return {
      entradas: result.entradas,
      fromCache: result.fromCache,
      error: result.error
    };

  } catch (error) {
    console.error(`💥 [SMART-OFFLINE] Erro ao buscar entradas da etapa ${etapaOsId}:`, error);
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
    const etapasResult = await secureDataStorage.getData('ETAPAS_OS', 'etapas_os_current');
    
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
    const etapasResult = await secureDataStorage.getData('ETAPAS_OS', 'etapas_os_current');
    const entradasResult = await secureDataStorage.getData('ENTRADAS_DADOS', 'entradas_dados_current');
    
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
      secureDataStorage.getData('ETAPAS_OS', 'etapas_os_current'),
      secureDataStorage.getData('ENTRADAS_DADOS', 'entradas_dados_current'),
      secureDataStorage.getData('TIPOS_OS', 'tipos_os_current')
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