import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import NetInfo from '@react-native-community/netinfo';
import storageAdapter from './storageAdapter';

// Chaves do cache para cada tabela
export const INITIAL_CACHE_KEYS = {
  USUARIOS: 'initial_cache_usuarios',
  CLIENTES: 'initial_cache_clientes',
  TIPOS_OS: 'initial_cache_tipos_os',
  ETAPAS_OS: 'initial_cache_etapas_os',
  ENTRADAS_DADOS: 'initial_cache_entradas_dados',
  DADOS: 'initial_cache_dados',
  AUDITORIAS_TECNICO: 'initial_cache_auditorias_tecnico',
  AUDITORIAS: 'initial_cache_auditorias',
  COMENTARIOS_ETAPA: 'initial_cache_comentarios_etapa',
  LAST_INITIAL_SYNC: 'last_initial_sync_timestamp',
  USER_INITIAL_SYNC: 'user_initial_sync_completed'
} as const;

// Interface para progresso da carga inicial
export interface InitialLoadProgress {
  current: number;
  total: number;
  currentTable: string;
  completed: boolean;
  error?: string;
}

// Interface para estatísticas da carga inicial
export interface InitialLoadStats {
  usuarios: number;
  clientes: number;
  tiposOs: number;
  etapasOs: number;
  entradasDados: number;
  dados: number;
  auditoriasTecnico: number;
  auditorias: number;
  comentariosEtapa: number;
  totalRecords: number;
  loadTime: number;
  timestamp: string;
}

/**
 * Verifica se a carga inicial já foi executada para o usuário atual
 */
export const isInitialSyncCompleted = async (userId: string): Promise<boolean> => {
  try {
    const key = `${INITIAL_CACHE_KEYS.USER_INITIAL_SYNC}_${userId}`;
    const completed = await storageAdapter.getItem(key);
    return completed === 'true';
  } catch (error) {
    console.error('❌ Erro ao verificar sync inicial:', error);
    return false;
  }
};

/**
 * Marca a carga inicial como concluída para o usuário
 */
const markInitialSyncCompleted = async (userId: string): Promise<void> => {
  try {
    const key = `${INITIAL_CACHE_KEYS.USER_INITIAL_SYNC}_${userId}`;
    await storageAdapter.setItem(key, 'true');
    
    // Também salvar timestamp da conclusão
    await storageAdapter.setItem(INITIAL_CACHE_KEYS.LAST_INITIAL_SYNC, new Date().toISOString());
    
    console.log('✅ Carga inicial marcada como concluída para o usuário:', userId);
  } catch (error) {
    console.error('❌ Erro ao marcar sync inicial como concluído:', error);
  }
};

/**
 * Carga inicial completa de todas as tabelas do Supabase
 */
export const performInitialDataLoad = async (
  userId: string,
  onProgress?: (progress: InitialLoadProgress) => void
): Promise<{ success: boolean; stats?: InitialLoadStats; error?: string }> => {
  const startTime = Date.now();
  
  try {
    // Verificar conectividade
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return { 
        success: false, 
        error: 'Sem conexão com a internet. A carga inicial requer conectividade.' 
      };
    }

    console.log('🚀 Iniciando carga inicial completa das tabelas do Supabase...');
    console.log('📦 Usando armazenamento híbrido para grandes volumes de dados');
    
    const totalTables = 9;
    let currentTable = 0;
    const stats: Partial<InitialLoadStats> = {};

    // Helper para atualizar progresso
    const updateProgress = (tableName: string, completed: boolean = false, error?: string) => {
      if (onProgress) {
        onProgress({
          current: currentTable,
          total: totalTables,
          currentTable: tableName,
          completed,
          error
        });
      }
    };

    // 1. USUARIOS
    updateProgress('Carregando usuários...');
    currentTable++;
    try {
      const { data: usuarios, error: usuariosError } = await supabase
        .from('usuario')
        .select('*');
      
      if (usuariosError) throw usuariosError;
      
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.USUARIOS, JSON.stringify(usuarios || []));
      stats.usuarios = usuarios?.length || 0;
      console.log(`✅ ${stats.usuarios} usuários carregados (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar usuários:', error);
      stats.usuarios = 0;
    }

    // 2. CLIENTES
    updateProgress('Carregando clientes...');
    currentTable++;
    try {
      const { data: clientes, error: clientesError } = await supabase
        .from('cliente')
        .select('*');
      
      if (clientesError) throw clientesError;
      
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.CLIENTES, JSON.stringify(clientes || []));
      stats.clientes = clientes?.length || 0;
      console.log(`✅ ${stats.clientes} clientes carregados (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar clientes:', error);
      stats.clientes = 0;
    }

    // 3. TIPOS_OS
    updateProgress('Carregando tipos de OS...');
    currentTable++;
    try {
      const { data: tiposOs, error: tiposError } = await supabase
        .from('tipo_os')
        .select('*');
      
      if (tiposError) throw tiposError;
      
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.TIPOS_OS, JSON.stringify(tiposOs || []));
      stats.tiposOs = tiposOs?.length || 0;
      console.log(`✅ ${stats.tiposOs} tipos de OS carregados (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar tipos de OS:', error);
      stats.tiposOs = 0;
    }

    // 4. ETAPAS_OS
    updateProgress('Carregando etapas de OS...');
    currentTable++;
    try {
      const { data: etapasOs, error: etapasError } = await supabase
        .from('etapa_os')
        .select('*')
        .eq('ativo', 1);
      
      if (etapasError) throw etapasError;
      
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.ETAPAS_OS, JSON.stringify(etapasOs || []));
      stats.etapasOs = etapasOs?.length || 0;
      console.log(`✅ ${stats.etapasOs} etapas de OS carregadas (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar etapas de OS:', error);
      stats.etapasOs = 0;
    }

    // 5. ENTRADAS_DADOS
    updateProgress('Carregando entradas de dados...');
    currentTable++;
    try {
      const { data: entradasDados, error: entradasError } = await supabase
        .from('entrada_dados')
        .select('*');
      
      if (entradasError) throw entradasError;
      
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.ENTRADAS_DADOS, JSON.stringify(entradasDados || []));
      stats.entradasDados = entradasDados?.length || 0;
      console.log(`✅ ${stats.entradasDados} entradas de dados carregadas (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar entradas de dados:', error);
      stats.entradasDados = 0;
    }

    // 6. DADOS (apenas do usuário para otimização)
    updateProgress('Carregando dados do usuário...');
    currentTable++;
    try {
      // Buscar apenas dados relacionados às OSs do usuário
      const { data: ordemServicos } = await supabase
        .from('ordem_servico')
        .select('id')
        .eq('tecnico_resp_id', parseInt(userId))
        .eq('ativo', 1);
      
      if (ordemServicos && ordemServicos.length > 0) {
        const osIds = ordemServicos.map(os => os.id);
        
        const { data: dados, error: dadosError } = await supabase
          .from('dados')
          .select('*')
          .in('ordem_servico_id', osIds)
          .eq('ativo', 1);
        
        if (dadosError) throw dadosError;
        
        await storageAdapter.setItem(INITIAL_CACHE_KEYS.DADOS, JSON.stringify(dados || []));
        stats.dados = dados?.length || 0;
      } else {
        stats.dados = 0;
      }
      console.log(`✅ ${stats.dados} registros de dados carregados (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar dados:', error);
      stats.dados = 0;
    }

    // 7. AUDITORIAS_TECNICO (apenas do usuário)
    updateProgress('Carregando auditorias do técnico...');
    currentTable++;
    try {
      const { data: auditoriasTecnico, error: auditoriasError } = await supabase
        .from('auditoria_tecnico')
        .select('*')
        .eq('auditor_id', parseInt(userId))
        .eq('ativo', 1);
      
      if (auditoriasError) throw auditoriasError;
      
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.AUDITORIAS_TECNICO, JSON.stringify(auditoriasTecnico || []));
      stats.auditoriasTecnico = auditoriasTecnico?.length || 0;
      console.log(`✅ ${stats.auditoriasTecnico} auditorias do técnico carregadas (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar auditorias do técnico:', error);
      stats.auditoriasTecnico = 0;
    }

    // 8. AUDITORIAS (tabela geral) - REMOVIDO: Tabela não existe, apenas auditoria_tecnico
    updateProgress('Auditorias gerais (pulando - tabela não existe)...');
    currentTable++;
    try {
      // Não existe tabela 'auditoria', apenas 'auditoria_tecnico'
      // Definir como 0 para evitar erro
      stats.auditorias = 0;
      await storageAdapter.setItem(INITIAL_CACHE_KEYS.AUDITORIAS, JSON.stringify([]));
      console.log(`✅ Auditorias gerais puladas (tabela não existe)`);
    } catch (error) {
      console.error('❌ Erro ao processar auditorias gerais:', error);
      stats.auditorias = 0;
    }

    // 9. COMENTARIOS_ETAPA (apenas do usuário)
    updateProgress('Carregando comentários...');
    currentTable++;
    try {
      // Buscar apenas comentários relacionados às OSs do usuário
      const { data: ordemServicos } = await supabase
        .from('ordem_servico')
        .select('id')
        .eq('tecnico_resp_id', parseInt(userId))
        .eq('ativo', 1);
      
      if (ordemServicos && ordemServicos.length > 0) {
        const osIds = ordemServicos.map(os => os.id);
        
        const { data: comentarios, error: comentariosError } = await supabase
          .from('comentario_etapa')
          .select('*')
          .in('ordem_servico_id', osIds);
        
        if (comentariosError) throw comentariosError;
        
        await storageAdapter.setItem(INITIAL_CACHE_KEYS.COMENTARIOS_ETAPA, JSON.stringify(comentarios || []));
        stats.comentariosEtapa = comentarios?.length || 0;
      } else {
        stats.comentariosEtapa = 0;
      }
      console.log(`✅ ${stats.comentariosEtapa} comentários carregados (armazenamento híbrido)`);
    } catch (error) {
      console.error('❌ Erro ao carregar comentários:', error);
      stats.comentariosEtapa = 0;
    }

    // Finalizar
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    const finalStats: InitialLoadStats = {
      usuarios: stats.usuarios || 0,
      clientes: stats.clientes || 0,
      tiposOs: stats.tiposOs || 0,
      etapasOs: stats.etapasOs || 0,
      entradasDados: stats.entradasDados || 0,
      dados: stats.dados || 0,
      auditoriasTecnico: stats.auditoriasTecnico || 0,
      auditorias: stats.auditorias || 0,
      comentariosEtapa: stats.comentariosEtapa || 0,
      totalRecords: (stats.usuarios || 0) + (stats.clientes || 0) + (stats.tiposOs || 0) + 
                   (stats.etapasOs || 0) + (stats.entradasDados || 0) + (stats.dados || 0) + 
                   (stats.auditoriasTecnico || 0) + (stats.auditorias || 0) + (stats.comentariosEtapa || 0),
      loadTime,
      timestamp: new Date().toISOString()
    };

    // Marcar como concluído
    await markInitialSyncCompleted(userId);
    
    updateProgress('Carga inicial concluída!', true);
    
    console.log('🎉 Carga inicial completa finalizada usando armazenamento híbrido:', finalStats);
    
    // Obter estatísticas do armazenamento para log
    try {
      const storageStats = await storageAdapter.getStorageStats();
      console.log('📊 Estatísticas do armazenamento após carga inicial:', {
        hybridStorageSize: storageStats.hybridStorageStats.totalSize,
        totalItems: storageStats.hybridStorageStats.totalItems,
        totalPhotos: storageStats.hybridStorageStats.totalPhotos,
        migrationCompleted: storageStats.migrationStatus.completed
      });
    } catch (error) {
      console.warn('⚠️ Erro ao obter estatísticas do armazenamento:', error);
      // Continuar execução mesmo com erro nas estatísticas
    }
    
    return { success: true, stats: finalStats };

  } catch (error) {
    console.error('💥 Erro na carga inicial:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro inesperado na carga inicial' 
    };
  }
};

/**
 * Obtém dados de uma tabela do cache inicial
 */
export const getCachedTableData = async <T = any>(tableName: keyof typeof INITIAL_CACHE_KEYS): Promise<T[]> => {
  try {
    const cacheKey = INITIAL_CACHE_KEYS[tableName];
    const cachedData = await storageAdapter.getItem(cacheKey);
    
    if (!cachedData) {
      return [];
    }
    
    return JSON.parse(cachedData) as T[];
  } catch (error) {
    console.error(`❌ Erro ao buscar dados da tabela ${tableName}:`, error);
    return [];
  }
};

/**
 * Obtém estatísticas da última carga inicial
 */
export const getInitialLoadStats = async (): Promise<InitialLoadStats | null> => {
  try {
    const statsData = await AsyncStorage.getItem('initial_load_stats');
    return statsData ? JSON.parse(statsData) : null;
  } catch (error) {
    console.error('❌ Erro ao buscar estatísticas da carga inicial:', error);
    return null;
  }
};

/**
 * Limpa todos os dados da carga inicial (para reset ou logout)
 */
export const clearInitialCache = async (userId?: string): Promise<void> => {
  try {
    const keysToRemove: string[] = [
      INITIAL_CACHE_KEYS.USUARIOS,
      INITIAL_CACHE_KEYS.CLIENTES,
      INITIAL_CACHE_KEYS.TIPOS_OS,
      INITIAL_CACHE_KEYS.ETAPAS_OS,
      INITIAL_CACHE_KEYS.ENTRADAS_DADOS,
      INITIAL_CACHE_KEYS.DADOS,
      INITIAL_CACHE_KEYS.AUDITORIAS_TECNICO,
      INITIAL_CACHE_KEYS.AUDITORIAS,
      INITIAL_CACHE_KEYS.COMENTARIOS_ETAPA,
      INITIAL_CACHE_KEYS.LAST_INITIAL_SYNC,
    ];
    
    if (userId) {
      keysToRemove.push(`${INITIAL_CACHE_KEYS.USER_INITIAL_SYNC}_${userId}`);
    }
    
    await storageAdapter.multiRemove(keysToRemove);
    console.log('🗑️ Cache da carga inicial limpo (armazenamento híbrido)');
  } catch (error) {
    console.error('❌ Erro ao limpar cache inicial:', error);
  }
};

/**
 * Força nova carga inicial (ignora se já foi executada)
 */
export const forceInitialDataLoad = async (
  userId: string,
  onProgress?: (progress: InitialLoadProgress) => void
): Promise<{ success: boolean; stats?: InitialLoadStats; error?: string }> => {
  // Limpar flag de conclusão
  const key = `${INITIAL_CACHE_KEYS.USER_INITIAL_SYNC}_${userId}`;
  await storageAdapter.removeItem(key);
  
  // Executar carga inicial
  return performInitialDataLoad(userId, onProgress);
}; 