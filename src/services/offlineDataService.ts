import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import NetInfo from '@react-native-community/netinfo';

/**
 * SERVIÇO DE DADOS OFFLINE
 * 
 * Garante que ETAPAS e ENTRADAS_DADOS estejam sempre disponíveis
 * para funcionamento offline completo do app.
 */

// CHAVES DO CACHE OFFLINE
const OFFLINE_CACHE_KEYS = {
  ETAPAS_OS: 'offline_etapas_os',
  ENTRADAS_DADOS: 'offline_entradas_dados',
  TIPOS_OS: 'offline_tipos_os',
  LAST_SYNC: 'offline_data_last_sync',
  VERSION: 'offline_data_version'
} as const;

export interface OfflineEtapa {
  id: number;
  titulo: string;
  ordem_etapa: number;
  tipo_os_id: number;
  ativo: number;
}

export interface OfflineEntradaDados {
  id: number;
  etapa_os_id: number;
  ordem_entrada: number;
  titulo: string;
  obrigatorio: number;
  tipo_campo: string;
  valor_padrao?: string;
  foto_modelo?: string;
}

export interface OfflineTipoOS {
  id: number;
  titulo: string;
  descricao?: string;
  ativo: number;
}

export interface OfflineDataSyncStats {
  etapas: number;
  entradas: number;
  tipos: number;
  syncTime: string;
  version: number;
}

/**
 * Verifica se os dados offline estão atualizados (menos de 24h)
 */
export const isOfflineDataFresh = async (): Promise<boolean> => {
  try {
    const lastSyncStr = await AsyncStorage.getItem(OFFLINE_CACHE_KEYS.LAST_SYNC);
    
    if (!lastSyncStr) {
      return false;
    }
    
    const lastSync = new Date(lastSyncStr);
    const now = new Date();
    const diffHours = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
    
    // Considerar fresco se menos de 24 horas
    return diffHours < 24;
    
  } catch (error) {
    console.error('❌ Erro ao verificar frescor dos dados offline:', error);
    return false;
  }
};

/**
 * DOWNLOAD COMPLETO: Baixa todas as etapas, entradas_dados e tipos_os
 */
export const downloadOfflineData = async (): Promise<{
  success: boolean;
  stats?: OfflineDataSyncStats;
  error?: string;
}> => {
  
  try {
    console.log('🔄 [OFFLINE-DATA] Iniciando download completo...');
    
    // Verificar conectividade
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return { 
        success: false, 
        error: 'Sem conexão para download de dados offline' 
      };
    }

    const startTime = Date.now();
    
    // 1. BAIXAR TIPOS DE OS
    console.log('📥 [OFFLINE-DATA] Baixando tipos de OS...');
    const { data: tiposOs, error: tiposError } = await supabase
      .from('tipo_os')
      .select('*')
      .eq('ativo', 1)
      .order('titulo');
    
    if (tiposError) {
      console.error('❌ Erro ao baixar tipos OS:', tiposError);
      return { success: false, error: `Erro ao baixar tipos OS: ${tiposError.message}` };
    }

    // 2. BAIXAR TODAS AS ETAPAS ATIVAS
    console.log('📥 [OFFLINE-DATA] Baixando etapas de serviço...');
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('*')
      .eq('ativo', 1)
      .order('tipo_os_id, ordem_etapa');
    
    if (etapasError) {
      console.error('❌ Erro ao baixar etapas:', etapasError);
      return { success: false, error: `Erro ao baixar etapas: ${etapasError.message}` };
    }

    // 3. BAIXAR TODAS AS ENTRADAS DE DADOS ATIVAS
    console.log('📥 [OFFLINE-DATA] Baixando entradas de dados...');
    const { data: entradas, error: entradasError } = await supabase
      .from('entrada_dados')
      .select('*')
      .eq('ativo', 1)
      .order('etapa_os_id, ordem_entrada');
    
    if (entradasError) {
      console.error('❌ Erro ao baixar entradas:', entradasError);
      return { success: false, error: `Erro ao baixar entradas: ${entradasError.message}` };
    }

    // 4. SALVAR NO ASYNCSTORAGE
    console.log('💾 [OFFLINE-DATA] Salvando dados localmente...');
    
    const version = Date.now();
    const syncTime = new Date().toISOString();
    
    await Promise.all([
      AsyncStorage.setItem(OFFLINE_CACHE_KEYS.TIPOS_OS, JSON.stringify(tiposOs || [])),
      AsyncStorage.setItem(OFFLINE_CACHE_KEYS.ETAPAS_OS, JSON.stringify(etapas || [])),
      AsyncStorage.setItem(OFFLINE_CACHE_KEYS.ENTRADAS_DADOS, JSON.stringify(entradas || [])),
      AsyncStorage.setItem(OFFLINE_CACHE_KEYS.LAST_SYNC, syncTime),
      AsyncStorage.setItem(OFFLINE_CACHE_KEYS.VERSION, version.toString())
    ]);

    // COMPATIBILIDADE: Também salvar nas chaves antigas para o sistema existente
    await Promise.all([
      AsyncStorage.setItem('initial_cache_tipos_os', JSON.stringify(tiposOs || [])),
      AsyncStorage.setItem('initial_cache_etapas_os', JSON.stringify(etapas || [])),
      AsyncStorage.setItem('initial_cache_entradas_dados', JSON.stringify(entradas || []))
    ]);

    const endTime = Date.now();
    const stats: OfflineDataSyncStats = {
      etapas: etapas?.length || 0,
      entradas: entradas?.length || 0,
      tipos: tiposOs?.length || 0,
      syncTime,
      version
    };

    console.log(`✅ [OFFLINE-DATA] Download concluído em ${endTime - startTime}ms:`, stats);
    
    return { success: true, stats };

  } catch (error) {
    console.error('💥 [OFFLINE-DATA] Erro no download:', error);
    return { 
      success: false, 
      error: `Erro inesperado: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
    };
  }
};

/**
 * BUSCA INTELIGENTE: Etapas por tipo de OS (offline-first)
 */
export const getEtapasByTipoOS = async (tipoOsId: number): Promise<{
  etapas: OfflineEtapa[];
  fromCache: boolean;
  error?: string;
}> => {
  
  try {
    console.log(`🔍 [OFFLINE-DATA] Buscando etapas do tipo OS ${tipoOsId}...`);
    
    // PRIORIDADE 1: Cache offline (mais recente)
    const etapasStr = await AsyncStorage.getItem(OFFLINE_CACHE_KEYS.ETAPAS_OS);
    
    if (etapasStr) {
      const todasEtapas: OfflineEtapa[] = JSON.parse(etapasStr);
      const etapasFiltradas = todasEtapas.filter(etapa => 
        etapa.tipo_os_id === tipoOsId && etapa.ativo === 1
      );
      
      if (etapasFiltradas.length > 0) {
        console.log(`✅ [OFFLINE-DATA] ${etapasFiltradas.length} etapas encontradas no cache offline`);
        return { etapas: etapasFiltradas, fromCache: true };
      }
    }

    // PRIORIDADE 2: Cache inicial (compatibilidade)
    const initialEtapasStr = await AsyncStorage.getItem('initial_cache_etapas_os');
    
    if (initialEtapasStr) {
      const todasEtapas: OfflineEtapa[] = JSON.parse(initialEtapasStr);
      const etapasFiltradas = todasEtapas.filter(etapa => 
        etapa.tipo_os_id === tipoOsId && etapa.ativo === 1
      );
      
      if (etapasFiltradas.length > 0) {
        console.log(`✅ [OFFLINE-DATA] ${etapasFiltradas.length} etapas encontradas no cache inicial`);
        return { etapas: etapasFiltradas, fromCache: true };
      }
    }

    // PRIORIDADE 3: Se online, tentar buscar do servidor
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      console.log('🌐 [OFFLINE-DATA] Online - buscando etapas do servidor...');
      
      const { data: etapas, error } = await supabase
        .from('etapa_os')
        .select('*')
        .eq('tipo_os_id', tipoOsId)
        .eq('ativo', 1)
        .order('ordem_etapa');
      
      if (!error && etapas && etapas.length > 0) {
        console.log(`✅ [OFFLINE-DATA] ${etapas.length} etapas encontradas no servidor`);
        return { etapas: etapas as OfflineEtapa[], fromCache: false };
      }
    }

    // FALLBACK: Etapas genéricas se nenhuma específica for encontrada
    console.log('⚠️ [OFFLINE-DATA] Usando etapas genéricas como fallback...');
    return {
      etapas: [
        {
          id: 999001,
          titulo: 'Documentação Fotográfica',
          ordem_etapa: 1,
          tipo_os_id: tipoOsId,
          ativo: 1
        },
        {
          id: 999002,
          titulo: 'Verificação Final',
          ordem_etapa: 2,
          tipo_os_id: tipoOsId,
          ativo: 1
        }
      ],
      fromCache: false
    };

  } catch (error) {
    console.error('💥 [OFFLINE-DATA] Erro ao buscar etapas:', error);
    return {
      etapas: [],
      fromCache: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * BUSCA INTELIGENTE: Entradas de dados por etapa (offline-first)
 */
export const getEntradasByEtapa = async (etapaOsId: number): Promise<{
  entradas: OfflineEntradaDados[];
  fromCache: boolean;
  error?: string;
}> => {
  
  try {
    console.log(`🔍 [OFFLINE-DATA] Buscando entradas da etapa ${etapaOsId}...`);
    
    // PRIORIDADE 1: Cache offline (mais recente)
    const entradasStr = await AsyncStorage.getItem(OFFLINE_CACHE_KEYS.ENTRADAS_DADOS);
    
    if (entradasStr) {
      const todasEntradas: OfflineEntradaDados[] = JSON.parse(entradasStr);
      const entradasFiltradas = todasEntradas.filter(entrada => 
        entrada.etapa_os_id === etapaOsId
      );
      
      if (entradasFiltradas.length > 0) {
        console.log(`✅ [OFFLINE-DATA] ${entradasFiltradas.length} entradas encontradas no cache offline`);
        return { entradas: entradasFiltradas, fromCache: true };
      }
    }

    // PRIORIDADE 2: Cache inicial (compatibilidade)
    const initialEntradasStr = await AsyncStorage.getItem('initial_cache_entradas_dados');
    
    if (initialEntradasStr) {
      const todasEntradas: OfflineEntradaDados[] = JSON.parse(initialEntradasStr);
      const entradasFiltradas = todasEntradas.filter(entrada => 
        entrada.etapa_os_id === etapaOsId
      );
      
      if (entradasFiltradas.length > 0) {
        console.log(`✅ [OFFLINE-DATA] ${entradasFiltradas.length} entradas encontradas no cache inicial`);
        return { entradas: entradasFiltradas, fromCache: true };
      }
    }

    // PRIORIDADE 3: Se online, tentar buscar do servidor
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      console.log('🌐 [OFFLINE-DATA] Online - buscando entradas do servidor...');
      
      const { data: entradas, error } = await supabase
        .from('entrada_dados')
        .select('*')
        .eq('etapa_os_id', etapaOsId)
        .eq('ativo', 1)
        .order('ordem_entrada');
      
      if (!error && entradas && entradas.length > 0) {
        console.log(`✅ [OFFLINE-DATA] ${entradas.length} entradas encontradas no servidor`);
        return { entradas: entradas as OfflineEntradaDados[], fromCache: false };
      }
    }

    // FALLBACK: Entrada genérica para foto
    console.log('⚠️ [OFFLINE-DATA] Usando entrada genérica como fallback...');
    return {
      entradas: [
        {
          id: 999000 + etapaOsId,
          etapa_os_id: etapaOsId,
          ordem_entrada: 1,
          titulo: 'Foto da Etapa',
          obrigatorio: 1,
          tipo_campo: 'foto'
        }
      ],
      fromCache: false
    };

  } catch (error) {
    console.error('💥 [OFFLINE-DATA] Erro ao buscar entradas:', error);
    return {
      entradas: [],
      fromCache: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * SINCRONIZAÇÃO AUTOMÁTICA: Se necessário, baixa dados atualizados
 */
export const ensureOfflineDataAvailable = async (): Promise<{
  available: boolean;
  fresh: boolean;
  error?: string;
}> => {
  
  try {
    console.log('🔄 [OFFLINE-DATA] Verificando disponibilidade de dados offline...');
    
    // Verificar se dados existem
    const etapasStr = await AsyncStorage.getItem(OFFLINE_CACHE_KEYS.ETAPAS_OS);
    const entradasStr = await AsyncStorage.getItem(OFFLINE_CACHE_KEYS.ENTRADAS_DADOS);
    
    const hasData = etapasStr && entradasStr;
    const isFresh = await isOfflineDataFresh();
    
    console.log(`📊 [OFFLINE-DATA] Status: hasData=${!!hasData}, isFresh=${isFresh}`);
    
    // Se não tem dados ou não está fresco, tentar download
    if (!hasData || !isFresh) {
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.isConnected) {
        console.log('🌐 [OFFLINE-DATA] Fazendo download de dados frescos...');
        const downloadResult = await downloadOfflineData();
        
        if (downloadResult.success) {
          console.log('✅ [OFFLINE-DATA] Dados atualizados com sucesso');
          return { available: true, fresh: true };
        } else {
          console.warn('⚠️ [OFFLINE-DATA] Falha no download, usando cache antigo se disponível');
          return { 
            available: !!hasData, 
            fresh: false, 
            error: downloadResult.error 
          };
        }
      } else {
        console.log('📱 [OFFLINE-DATA] Offline - usando dados em cache se disponível');
        return { 
          available: !!hasData, 
          fresh: false, 
          error: hasData ? undefined : 'Sem dados offline e sem conexão' 
        };
      }
    }
    
    console.log('✅ [OFFLINE-DATA] Dados offline já disponíveis e frescos');
    return { available: true, fresh: true };

  } catch (error) {
    console.error('💥 [OFFLINE-DATA] Erro ao garantir dados offline:', error);
    return { 
      available: false, 
      fresh: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * DIAGNÓSTICO: Status completo dos dados offline
 */
export const getOfflineDataDiagnostics = async (): Promise<{
  hasEtapas: boolean;
  hasEntradas: boolean;
  hasTipos: boolean;
  lastSync?: string;
  version?: number;
  stats?: OfflineDataSyncStats;
  recommendations: string[];
}> => {
  
  try {
    const [etapasStr, entradasStr, tiposStr, lastSyncStr, versionStr] = await Promise.all([
      AsyncStorage.getItem(OFFLINE_CACHE_KEYS.ETAPAS_OS),
      AsyncStorage.getItem(OFFLINE_CACHE_KEYS.ENTRADAS_DADOS),
      AsyncStorage.getItem(OFFLINE_CACHE_KEYS.TIPOS_OS),
      AsyncStorage.getItem(OFFLINE_CACHE_KEYS.LAST_SYNC),
      AsyncStorage.getItem(OFFLINE_CACHE_KEYS.VERSION)
    ]);

    const hasEtapas = !!etapasStr;
    const hasEntradas = !!entradasStr;
    const hasTipos = !!tiposStr;
    const isFresh = await isOfflineDataFresh();

    let stats: OfflineDataSyncStats | undefined;
    
    if (hasEtapas && hasEntradas && hasTipos && lastSyncStr) {
      const etapas = JSON.parse(etapasStr);
      const entradas = JSON.parse(entradasStr);
      const tipos = JSON.parse(tiposStr);
      
      stats = {
        etapas: etapas.length,
        entradas: entradas.length,
        tipos: tipos.length,
        syncTime: lastSyncStr,
        version: versionStr ? parseInt(versionStr) : 0
      };
    }

    const recommendations: string[] = [];
    
    if (!hasEtapas || !hasEntradas) {
      recommendations.push('❌ CRÍTICO: Dados offline ausentes - faça login online');
    } else if (!isFresh) {
      recommendations.push('⏰ Dados offline antigos - sincronize quando online');
    } else {
      recommendations.push('✅ Dados offline atualizados e prontos');
    }

    return {
      hasEtapas,
      hasEntradas,
      hasTipos,
      lastSync: lastSyncStr || undefined,
      version: versionStr ? parseInt(versionStr) : undefined,
      stats,
      recommendations
    };

  } catch (error) {
    console.error('💥 [OFFLINE-DATA] Erro no diagnóstico:', error);
    return {
      hasEtapas: false,
      hasEntradas: false,
      hasTipos: false,
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