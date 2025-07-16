import { supabase } from './supabase';
import { 
  cacheServiceSteps, 
  cacheServiceEntries, 
  getCachedServiceStepsWithData,
  CachedServiceEntries 
} from './cacheService';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ServiceStep {
  id: number;
  titulo: string;
  ordem_etapa: number;
  etapa_os_id: number;
  entradas?: ServiceStepData[]; // Entradas relacionadas a esta etapa
}

export interface ServiceStepData {
  id: number;
  etapa_os_id: number;
  ordem_entrada: number;
  titulo?: string;
  valor?: string;
  foto_base64?: string;
  foto_modelo?: string; // Foto modelo do banco de dados
  completed: boolean;
  created_at?: string;
}

export interface DadosRecord {
  id?: number;
  ativo: number; // 1 para ativo, 0 para inativo
  valor: string; // foto em base64
  ordem_servico_id: number;
  entrada_dados_id: number | null; // null para fotos extras
  created_at?: string;
  dt_edicao?: string;
}

export interface ComentarioEtapa {
  id?: number;
  ordem_servico_id: number;
  etapa_id: number;
  comentario: string;
  created_at?: string;
  dt_edicao?: string;
}

/**
 * Busca as etapas de serviço baseado no tipo_os_id
 */
export const getServiceStepsByTypeId = async (
  tipoOsId: number
): Promise<{ data: ServiceStep[] | null; error: string | null }> => {
  try {
    // Primeira tentativa: buscar etapas específicas do tipo (sem filtro ativo)
    let { data, error } = await supabase
      .from('etapa_os')
      .select(`
        id,
        titulo,
        ordem_etapa
      `)
      .eq('tipo_os_id', tipoOsId)
      .order('ordem_etapa', { ascending: true });

    // Se não encontrou etapas para este tipo específico, buscar de qualquer tipo
    if (!error && (!data || data.length === 0)) {
      const fallbackResult = await supabase
        .from('etapa_os')
        .select(`
          id,
          titulo,
          ordem_etapa
        `)
        .order('ordem_etapa', { ascending: true })
        .limit(10); // Limitar para não pegar muitas
      
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error('❌ Erro ao buscar etapas do serviço:', error);
      return { data: null, error: error.message };
    }

    // Mapear dados para o formato esperado
    const steps: ServiceStep[] = data?.map(etapa => ({
      id: etapa.id,
      titulo: etapa.titulo,
      ordem_etapa: etapa.ordem_etapa || 0,
      etapa_os_id: etapa.id,
      entradas: [], // Será preenchido posteriormente
    })) || [];

    return { data: steps, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar etapas:', error);
    return { data: null, error: 'Erro inesperado ao buscar etapas do serviço' };
  }
};

/**
 * Busca dados salvos de etapas para etapas específicas e organiza por etapa
 */
export const getServiceStepDataBySteps = async (
  etapaIds: number[],
  workOrderId?: number
): Promise<{ data: { [etapaId: number]: ServiceStepData[] } | null; error: string | null }> => {
  try {
    if (!etapaIds || etapaIds.length === 0) {
      return { data: {}, error: null };
    }

    // Se temos workOrderId, priorizar dados locais
    if (workOrderId) {
      try {
        const localDataService = (await import('./localDataService')).default;
        const localData = await localDataService.getServiceStepDataCombined(workOrderId, etapaIds);
        
        // Se temos dados locais, usar eles
        if (Object.keys(localData).length > 0) {
          console.log(`📱 Usando dados locais para ${Object.keys(localData).length} etapas`);
          return { data: localData, error: null };
        }
      } catch (localError) {
        console.warn('⚠️ Erro ao buscar dados locais, tentando servidor:', localError);
      }
    }

    // Fallback para servidor
    const { data, error } = await supabase
      .from('entrada_dados')
      .select('*')
      .in('etapa_os_id', etapaIds)
      .order('ordem_entrada', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar dados das etapas:', error);
      return { data: null, error: error.message };
    }

    // Organizar dados por etapa_os_id
    const dataByStep: { [etapaId: number]: ServiceStepData[] } = {};
    
    data?.forEach(entrada => {
      if (!dataByStep[entrada.etapa_os_id]) {
        dataByStep[entrada.etapa_os_id] = [];
      }
      dataByStep[entrada.etapa_os_id].push(entrada);
    });

    return { data: dataByStep, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar dados das etapas:', error);
    return { data: null, error: 'Erro inesperado ao buscar dados das etapas' };
  }
};

/**
 * Combina etapas com seus dados relacionados
 */
export const getServiceStepsWithData = async (
  tipoOsId: number,
  ordemServicoId: number
): Promise<{ data: ServiceStep[] | null; error: string | null }> => {
  try {
    // 1. Buscar etapas
    const { data: steps, error: stepsError } = await getServiceStepsByTypeId(tipoOsId);
    if (stepsError || !steps) {
      return { data: null, error: stepsError };
    }

    // 2. Buscar dados das etapas usando os IDs das etapas (passando workOrderId)
    const etapaIds = steps.map(step => step.id);
    
    const { data: stepData, error: dataError } = await getServiceStepDataBySteps(etapaIds, ordemServicoId);
    if (dataError) {
      console.warn('⚠️ Erro ao buscar dados das etapas, continuando sem dados:', dataError);
    }

    // 3. Combinar etapas com seus dados
    const stepsWithData = steps.map(step => ({
      ...step,
      entradas: stepData?.[step.id] || []
    }));

    return { data: stepsWithData, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao combinar etapas com dados:', error);
    return { data: null, error: 'Erro inesperado ao combinar etapas com dados' };
  }
};

/**
 * Salva dados de uma etapa (foto, texto, etc.)
 */
export const saveServiceStepData = async (
  ordemServicoId: number,
  etapaId: number,
  valor?: string,
  fotoBase64?: string
): Promise<{ data: ServiceStepData | null; error: string | null }> => {
  try {
    // Verificar conectividade
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    
    // Se offline, salvar localmente
    if (!netInfo.isConnected) {
      console.log('📱 Offline: salvando dados de etapa localmente');
      
      try {
        const localDataService = (await import('./localDataService')).default;
        const result = await localDataService.saveServiceStepDataLocal(
          ordemServicoId,
          etapaId,
          valor,
          fotoBase64
        );
        
        if (result.success) {
          return { data: result.data, error: null };
        } else {
          return { data: null, error: result.error || 'Erro ao salvar dados localmente' };
        }
      } catch (localError) {
        console.error('❌ Erro ao salvar dados localmente:', localError);
        return { data: null, error: 'Erro ao salvar dados localmente' };
      }
    }

    // Online: tentar salvar no servidor
    console.log('🌐 Online: salvando dados de etapa no servidor');
    
    // Buscar a próxima ordem_entrada para esta etapa
    const { data: existingEntries, error: countError } = await supabase
      .from('entrada_dados')
      .select('ordem_entrada')
      .eq('etapa_os_id', etapaId)
      .order('ordem_entrada', { ascending: false })
      .limit(1);

    if (countError) {
      console.error('❌ Erro ao buscar ordem_entrada:', countError);
      
      // Fallback para dados locais
      console.log('📱 Falha no servidor: salvando dados localmente como fallback');
      try {
        const localDataService = (await import('./localDataService')).default;
        const result = await localDataService.saveServiceStepDataLocal(
          ordemServicoId,
          etapaId,
          valor,
          fotoBase64
        );
        
        if (result.success) {
          return { data: result.data, error: null };
        }
      } catch (localError) {
        console.error('❌ Erro no fallback local:', localError);
      }
      
      return { data: null, error: countError.message };
    }

    const nextOrdem = existingEntries && existingEntries.length > 0 
      ? (existingEntries[0].ordem_entrada || 0) + 1 
      : 1;

    const { data, error } = await supabase
      .from('entrada_dados')
      .insert({
        etapa_os_id: etapaId,
        ordem_entrada: nextOrdem,
        valor: valor,
        foto_base64: fotoBase64,
        completed: true,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      console.error('❌ Erro ao salvar dados da etapa no servidor:', error);
      
      // Fallback para dados locais
      console.log('📱 Falha no servidor: salvando dados localmente como fallback');
      try {
        const localDataService = (await import('./localDataService')).default;
        const result = await localDataService.saveServiceStepDataLocal(
          ordemServicoId,
          etapaId,
          valor,
          fotoBase64
        );
        
        if (result.success) {
          return { data: result.data, error: null };
        }
      } catch (localError) {
        console.error('❌ Erro no fallback local:', localError);
      }
      
      return { data: null, error: error.message };
    }

    console.log('✅ Dados de etapa salvos no servidor com sucesso');
    return { data, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao salvar dados da etapa:', error);
    
    // Último fallback para dados locais
    try {
      const localDataService = (await import('./localDataService')).default;
      const result = await localDataService.saveServiceStepDataLocal(
        ordemServicoId,
        etapaId,
        valor,
        fotoBase64
      );
      
      if (result.success) {
        return { data: result.data, error: null };
      }
    } catch (localError) {
      console.error('❌ Erro no fallback final:', localError);
    }
    
    return { data: null, error: 'Erro inesperado ao salvar dados da etapa' };
  }
};

/**
 * Busca dados salvos de etapas para uma ordem de serviço (função original mantida para compatibilidade)
 */
export const getServiceStepData = async (
  tipoOsId: number
): Promise<{ data: ServiceStepData[] | null; error: string | null }> => {
  try {
    // Buscar etapas do tipo de OS
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('id')
      .eq('tipo_os_id', tipoOsId);

    if (etapasError) {
      console.error('❌ Erro ao buscar etapas:', etapasError);
      return { data: null, error: etapasError.message };
    }

    if (!etapas || etapas.length === 0) {
      return { data: [], error: null };
    }

    const etapaIds = etapas.map(e => e.id);

    const { data, error } = await supabase
      .from('entrada_dados')
      .select('*')
      .in('etapa_os_id', etapaIds)
      .order('ordem_entrada', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar dados das etapas:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar dados das etapas:', error);
    return { data: null, error: 'Erro inesperado ao buscar dados das etapas' };
  }
};

/**
 * Atualiza dados de uma etapa existente
 */
export const updateServiceStepData = async (
  id: number,
  valor?: string,
  fotoBase64?: string
): Promise<{ data: ServiceStepData | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('entrada_dados')
      .update({
        valor: valor,
        foto_base64: fotoBase64,
        completed: true,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar dados da etapa:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao atualizar dados da etapa:', error);
    return { data: null, error: 'Erro inesperado ao atualizar dados da etapa' };
  }
};

/**
 * Função de teste para verificar dados nas tabelas
 */
export const testDatabaseData = async (): Promise<void> => {
  try {
    console.log('🧪 === TESTE DE DADOS DO BANCO ===');
    
    // Testar tabela etapa_os
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('*')
      .limit(5);
    
    console.log('📊 Dados da tabela etapa_os:', { 
      count: etapas?.length || 0, 
      error: etapasError,
      sample: etapas?.slice(0, 2) 
    });
    
    // Testar tabela entrada_dados
    const { data: entradas, error: entradasError } = await supabase
      .from('entrada_dados')
      .select('*')
      .limit(5);
    
    // Testar tabela tipo_os
    const { data: tipos, error: tiposError } = await supabase
      .from('tipo_os')
      .select('id, titulo')
      .limit(5);
    
    console.log('🧪 === FIM DO TESTE ===');
  } catch (error) {
    console.error('💥 Erro no teste de dados:', error);
  }
};

/**
 * Função para inserir dados de exemplo para teste
 */
export const insertTestData = async (): Promise<void> => {
  try {
    console.log('🧪 === INSERINDO DADOS DE TESTE ===');
    
    // Verificar se já existem dados
    const { data: existingEtapas } = await supabase
      .from('etapa_os')
      .select('id')
      .limit(1);
    
    if (existingEtapas && existingEtapas.length > 0) {
      console.log('⚠️ Dados já existem, pulando inserção');
      return;
    }
    
    // Inserir tipo_os de exemplo
    const { data: tipoOs, error: tipoError } = await supabase
      .from('tipo_os')
      .insert({
        titulo: 'Instalação Padrão'
      })
      .select('id')
      .single();
    
    if (tipoError) {
      console.error('❌ Erro ao inserir tipo_os:', tipoError);
      return;
    }
    
    console.log('✅ Tipo OS criado:', tipoOs.id);
    
    // Inserir etapas de exemplo
    const etapasExemplo = [
      { titulo: 'Frente da CDI', ordem_etapa: 1, tipo_os_id: tipoOs.id, ativo: 1 },
      { titulo: 'Porta de Entrada', ordem_etapa: 2, tipo_os_id: tipoOs.id, ativo: 1 },
      { titulo: 'Local de instalação da antena', ordem_etapa: 3, tipo_os_id: tipoOs.id, ativo: 1 },
    ];
    
    const { data: etapasInseridas, error: etapasError } = await supabase
      .from('etapa_os')
      .insert(etapasExemplo)
      .select('*');
    
    if (etapasError) {
      console.error('❌ Erro ao inserir etapas:', etapasError);
      return;
    }
    
    console.log('✅ Etapas criadas:', etapasInseridas?.length);
    
    // Inserir algumas entradas de exemplo
    if (etapasInseridas && etapasInseridas.length > 0) {
      const entradasExemplo = [
        {
          etapa_os_id: etapasInseridas[0].id,
          ordem_entrada: 1,
          valor: 'Foto da frente da CDI tirada',
          completed: true
        },
        {
          etapa_os_id: etapasInseridas[1].id,
          ordem_entrada: 1,
          valor: 'Porta de entrada documentada',
          completed: true
        }
      ];
      
      const { data: entradasInseridas, error: entradasError } = await supabase
        .from('entrada_dados')
        .insert(entradasExemplo)
        .select('*');
      
      if (entradasError) {
        console.error('❌ Erro ao inserir entradas:', entradasError);
      } else {
        console.log('✅ Entradas criadas:', entradasInseridas?.length);
      }
    }
    
    console.log('🧪 === DADOS DE TESTE INSERIDOS ===');
  } catch (error) {
    console.error('💥 Erro ao inserir dados de teste:', error);
  }
};

/**
 * Função para atualizar uma OS com tipo_os_id de teste
 */
export const updateWorkOrderWithTestType = async (workOrderId: number): Promise<void> => {
  try {
    console.log('🔧 Atualizando OS com tipo_os_id de teste...');
    
    // Buscar um tipo_os existente
    const { data: tipoOs, error: tipoError } = await supabase
      .from('tipo_os')
      .select('id')
      .limit(1)
      .single();
    
    if (tipoError || !tipoOs) {
      console.log('⚠️ Nenhum tipo_os encontrado, criando um...');
      
      const { data: novoTipo, error: novoTipoError } = await supabase
        .from('tipo_os')
        .insert({
          titulo: 'Instalação Padrão'
        })
        .select('id')
        .single();
      
      if (novoTipoError || !novoTipo) {
        console.error('❌ Erro ao criar tipo_os:', novoTipoError);
        return;
      }
      
      // Atualizar a OS com o novo tipo
      const { error: updateError } = await supabase
        .from('ordem_servico')
        .update({ tipo_os_id: novoTipo.id })
        .eq('id', workOrderId);
      
      if (updateError) {
        console.error('❌ Erro ao atualizar OS:', updateError);
      } else {
        console.log('✅ OS atualizada com tipo_os_id:', novoTipo.id);
      }
    } else {
      // Atualizar a OS com o tipo existente
      const { error: updateError } = await supabase
        .from('ordem_servico')
        .update({ tipo_os_id: tipoOs.id })
        .eq('id', workOrderId);
      
      if (updateError) {
        console.error('❌ Erro ao atualizar OS:', updateError);
      } else {
        console.log('✅ OS atualizada com tipo_os_id:', tipoOs.id);
      }
    }
  } catch (error) {
    console.error('💥 Erro ao atualizar OS com tipo_os_id:', error);
  }
};

/**
 * Função de debug para analisar a estrutura real das tabelas
 */
export const debugDatabaseStructure = async (): Promise<void> => {
  try {
    console.log('🔍 === ANÁLISE DA ESTRUTURA DO BANCO ===');
    
    // 1. Analisar ordem_servico
    console.log('📋 1. ORDEM_SERVICO:');
    const { data: ordens, error: ordensError } = await supabase
      .from('ordem_servico')
      .select('id, tipo_os_id, os_motivo_descricao')
      .limit(3);
    
    console.log('Ordens de serviço:', { 
      count: ordens?.length || 0, 
      error: ordensError,
      data: ordens 
    });
    
    // 2. Analisar tipo_os
    console.log('📋 2. TIPO_OS:');
    const { data: tipos, error: tiposError } = await supabase
      .from('tipo_os')
      .select('*')
      .limit(5);
    
    console.log('Tipos de OS:', { 
      count: tipos?.length || 0, 
      error: tiposError,
      data: tipos 
    });
    
    // 3. Analisar etapa_os
    console.log('📋 3. ETAPA_OS:');
    const { data: etapas, error: etapasError } = await supabase
      .from('etapa_os')
      .select('*')
      .limit(5);
    
    console.log('Etapas:', { 
      count: etapas?.length || 0, 
      error: etapasError,
      data: etapas 
    });
    
    // 4. Analisar entrada_dados
    console.log('📋 4. ENTRADA_DADOS:');
    const { data: entradas, error: entradasError } = await supabase
      .from('entrada_dados')
      .select('*')
      .limit(5);
    
    console.log('Entradas:', { 
      count: entradas?.length || 0, 
      error: entradasError
    });

    // 5. Testar relação completa se temos dados
    if (ordens && ordens.length > 0 && ordens[0].tipo_os_id) {
      console.log('📋 5. TESTE DE RELAÇÃO COMPLETA:');
      const tipoOsId = ordens[0].tipo_os_id;
      console.log(`Testando com tipo_os_id: ${tipoOsId}`);
      
      // Buscar etapas deste tipo
      const { data: etapasTeste, error: etapasTesteError } = await supabase
        .from('etapa_os')
        .select('*')
        .eq('tipo_os_id', tipoOsId)
        .eq('ativo', 1)
        .order('ordem_etapa', { ascending: true });
      
      console.log('Etapas encontradas para este tipo:', { 
        count: etapasTeste?.length || 0, 
        error: etapasTesteError,
        data: etapasTeste 
      });
      
      // Se temos etapas, buscar entradas
      if (etapasTeste && etapasTeste.length > 0) {
        const etapaIds = etapasTeste.map(e => e.id);
        console.log('IDs das etapas:', etapaIds);
        
        const { data: entradasTeste, error: entradasTesteError } = await supabase
          .from('entrada_dados')
          .select('*')
          .in('etapa_os_id', etapaIds)
          .order('ordem_entrada', { ascending: true });
        
        console.log('Entradas encontradas para estas etapas:', { 
          count: entradasTeste?.length || 0, 
          error: entradasTesteError
        });
        
        // Organizar por etapa
        if (entradasTeste && entradasTeste.length > 0) {
          const entradasPorEtapa: { [key: number]: any[] } = {};
          entradasTeste.forEach(entrada => {
            if (!entradasPorEtapa[entrada.etapa_os_id]) {
              entradasPorEtapa[entrada.etapa_os_id] = [];
            }
            entradasPorEtapa[entrada.etapa_os_id].push(entrada);
          });
          
          console.log('Entradas organizadas por etapa - count:', Object.keys(entradasPorEtapa).length);
        }
      }
    }
    
    console.log('🔍 === FIM DA ANÁLISE ===');
  } catch (error) {
    console.error('💥 Erro na análise da estrutura:', error);
  }
};

/**
 * Versão de teste - busca etapas sem filtrar por ativo
 */
export const getServiceStepsByTypeIdTest = async (
  tipoOsId: number
): Promise<{ data: ServiceStep[] | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('etapa_os')
      .select(`
        id,
        titulo,
        ordem_etapa,
        ativo
      `)
      .eq('tipo_os_id', tipoOsId)
      .order('ordem_etapa', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar etapas do serviço:', error);
      return { data: null, error: error.message };
    }

    // Mapear dados para o formato esperado
    const steps: ServiceStep[] = data?.map(etapa => ({
      id: etapa.id,
      titulo: etapa.titulo,
      ordem_etapa: etapa.ordem_etapa || 0,
      etapa_os_id: etapa.id,
      entradas: [], // Será preenchido posteriormente
    })) || [];

    return { data: steps, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar etapas:', error);
    return { data: null, error: 'Erro inesperado ao buscar etapas do serviço' };
  }
};

/**
 * Função para buscar TODAS as etapas (para debug)
 */
export const getAllStepsForDebug = async (): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('etapa_os')
      .select('*')
      .limit(10);

    console.log('📊 Todas as etapas encontradas:', { 
      count: data?.length || 0, 
      error,
      data: data 
    });

    if (data && data.length > 0) {
      console.log('📋 Tipos de OS únicos encontrados:', 
        [...new Set(data.map(e => e.tipo_os_id))]);
      console.log('📋 Valores do campo ativo:', 
        [...new Set(data.map(e => e.ativo))]);
    }
  } catch (error) {
    console.error('💥 Erro ao buscar todas as etapas:', error);
  }
};

/**
 * Busca etapas com cache - USANDO ASYNCSTORAGE DIRETO
 */
export const getServiceStepsWithDataCached = async (
  tipoOsId: number,
  ordemServicoId: number
): Promise<{ data: ServiceStep[] | null; error: string | null; fromCache: boolean }> => {
  try {
    console.log(`🔍 getServiceStepsWithDataCached: tipo_os_id=${tipoOsId}, ordem_servico_id=${ordemServicoId}`);
    
    // Verificar conectividade PRIMEIRO
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    console.log(`📶 Conectividade: ${netInfo.isConnected ? 'Online' : 'Offline'}`);
    
    // PRIORIDADE 1: Buscar dados direto do AsyncStorage (SEM cache híbrido)
    console.log('📱 Buscando dados direto do AsyncStorage...');
    
    try {
      // Buscar etapas direto do AsyncStorage
      const stepsKey = `service_steps_${tipoOsId}`;
      const stepsData = await AsyncStorage.getItem(stepsKey);
      
      if (stepsData) {
        const steps: ServiceStep[] = JSON.parse(stepsData);
        console.log(`📝 ${steps.length} etapas encontradas no AsyncStorage`);
        
        // Buscar entradas direto do AsyncStorage
        const entriesKey = `service_entries_${tipoOsId}`;
        const entriesData = await AsyncStorage.getItem(entriesKey);
        
        let entriesByStep: any = {};
        if (entriesData) {
          entriesByStep = JSON.parse(entriesData);
        }
        
        // Buscar também dados locais se disponível
        try {
          const localDataService = (await import('./localDataService')).default;
          const etapaIds = steps.map(step => step.id);
          const localData = await localDataService.getServiceStepDataCombined(ordemServicoId, etapaIds);
          
          // Combinar dados locais com dados do AsyncStorage
          Object.keys(localData).forEach(etapaId => {
            const etapaIdNum = parseInt(etapaId);
            if (!entriesByStep[etapaIdNum] || entriesByStep[etapaIdNum].length === 0) {
              entriesByStep[etapaIdNum] = localData[etapaIdNum];
            }
          });
        } catch (localError) {
          console.warn('⚠️ Erro ao buscar dados locais:', localError);
        }
        
        // Combinar etapas com entradas
        const stepsWithData = steps.map(step => ({
          ...step,
          entradas: entriesByStep[step.id] || []
        }));
        
        const totalEntries = stepsWithData.reduce((sum, step) => sum + (step.entradas?.length || 0), 0);
        console.log(`✅ ${stepsWithData.length} etapas com ${totalEntries} entradas carregadas do AsyncStorage`);
        
        return { data: stepsWithData, error: null, fromCache: true };
      }
    } catch (asyncStorageError) {
      console.warn('⚠️ Erro ao buscar dados do AsyncStorage direto:', asyncStorageError);
    }
    
    // Se está OFFLINE e não tem dados no AsyncStorage, tentar dados de inicialização
    if (!netInfo.isConnected) {
      console.log('📱 OFFLINE: Tentando dados de inicialização...');
      
      try {
        // Buscar etapas do cache inicial (SEM usar sistema híbrido)
        const initialEtapasData = await AsyncStorage.getItem('initial_cache_etapas_os');
        
        if (initialEtapasData) {
          const cachedEtapas = JSON.parse(initialEtapasData);
          
          // Filtrar etapas do tipo específico
          const etapasFiltradas = cachedEtapas.filter((etapa: any) => 
            etapa.tipo_os_id === tipoOsId && etapa.ativo === 1
          );
          
          if (etapasFiltradas.length > 0) {
            console.log(`📝 ${etapasFiltradas.length} etapas encontradas no cache inicial`);
            
            // Mapear para formato ServiceStep
            const steps: ServiceStep[] = etapasFiltradas.map((etapa: any) => ({
              id: etapa.id,
              titulo: etapa.titulo,
              ordem_etapa: etapa.ordem_etapa || 0,
              etapa_os_id: etapa.id,
              entradas: []
            }));
            
            // Buscar entradas do cache inicial
            const initialEntradasData = await AsyncStorage.getItem('initial_cache_entradas_dados');
            const etapaIds = steps.map(step => step.id);
            
            // Buscar dados locais primeiro
            let entriesData: any = {};
            try {
              const localDataService = (await import('./localDataService')).default;
              entriesData = await localDataService.getServiceStepDataCombined(ordemServicoId, etapaIds);
            } catch (localError) {
              console.warn('⚠️ Erro ao buscar dados locais:', localError);
            }
            
            // Combinar com dados do cache inicial se não houver dados locais
            if (initialEntradasData) {
              const cachedEntradas = JSON.parse(initialEntradasData);
              etapaIds.forEach(etapaId => {
                if (!entriesData[etapaId] || entriesData[etapaId].length === 0) {
                  const cacheData = cachedEntradas.filter((entrada: any) => entrada.etapa_os_id === etapaId);
                  
                  if (cacheData.length > 0) {
                    entriesData[etapaId] = cacheData.map((entrada: any) => ({
                      id: entrada.id,
                      etapa_os_id: entrada.etapa_os_id,
                      ordem_entrada: entrada.ordem_entrada || 1,
                      titulo: entrada.titulo,
                      valor: entrada.valor,
                      foto_base64: entrada.foto_base64,
                      foto_modelo: entrada.foto_modelo,
                      completed: entrada.completed || false,
                      created_at: entrada.created_at,
                      local: false
                    }));
                  }
                }
              });
            }
            
            // Combinar etapas com entradas
            const stepsWithData = steps.map(step => ({
              ...step,
              entradas: entriesData[step.id] || []
            }));
            
            const totalEntries = stepsWithData.reduce((sum, step) => sum + (step.entradas?.length || 0), 0);
            console.log(`✅ OFFLINE: ${stepsWithData.length} etapas com ${totalEntries} entradas recuperadas`);
            
            return { data: stepsWithData, error: null, fromCache: true };
          }
        }
      } catch (fallbackError) {
        console.error('💥 Erro na abordagem alternativa offline:', fallbackError);
      }
      
      console.log('❌ OFFLINE: Nenhum dado encontrado');
      return { data: null, error: 'Sem dados offline disponíveis - faça login online primeiro', fromCache: false };
    }

    // APENAS SE ESTIVER ONLINE - buscar do servidor
    console.log('🌐 ONLINE: Buscando etapas do servidor...');
    try {
      const serverResult = await getServiceStepsWithData(tipoOsId, ordemServicoId);
      
      if (serverResult.data && !serverResult.error) {
        // Fazer cache dos dados do servidor (DIRETO NO ASYNCSTORAGE)
        try {
          await cacheServerData(tipoOsId, serverResult.data);
        } catch (cacheError) {
          console.warn('⚠️ Erro ao fazer cache dos dados do servidor:', cacheError);
        }
        
        const totalEntries = serverResult.data.reduce((sum, step) => sum + (step.entradas?.length || 0), 0);
        console.log(`✅ ONLINE: ${serverResult.data.length} etapas com ${totalEntries} entradas do servidor`);
        
        return { ...serverResult, fromCache: false };
      } else {
        console.error('❌ Erro do servidor:', serverResult.error);
        return { ...serverResult, fromCache: false };
      }
    } catch (serverError) {
      console.error('💥 Erro de conexão com servidor:', serverError);
      // Se há erro de conexão, tentar usar dados do cache inicial como fallback
      console.log('🔄 Tentando usar cache inicial como fallback após erro de servidor...');
      
      try {
        const initialEtapasData = await AsyncStorage.getItem('initial_cache_etapas_os');
        
        if (initialEtapasData) {
          const cachedEtapas = JSON.parse(initialEtapasData);
          const etapasFiltradas = cachedEtapas.filter((etapa: any) => 
            etapa.tipo_os_id === tipoOsId && etapa.ativo === 1
          );
          
          if (etapasFiltradas.length > 0) {
            const steps: ServiceStep[] = etapasFiltradas.map((etapa: any) => ({
              id: etapa.id,
              titulo: etapa.titulo,
              ordem_etapa: etapa.ordem_etapa || 0,
              etapa_os_id: etapa.id,
              entradas: []
            }));
            
            const initialEntradasData = await AsyncStorage.getItem('initial_cache_entradas_dados');
            const etapaIds = steps.map(step => step.id);
            
            const entriesData: any = {};
            if (initialEntradasData) {
              const cachedEntradas = JSON.parse(initialEntradasData);
              etapaIds.forEach(etapaId => {
                const cacheData = cachedEntradas.filter((entrada: any) => entrada.etapa_os_id === etapaId);
                
                if (cacheData.length > 0) {
                  entriesData[etapaId] = cacheData.map((entrada: any) => ({
                    id: entrada.id,
                    etapa_os_id: entrada.etapa_os_id,
                    ordem_entrada: entrada.ordem_entrada || 1,
                    titulo: entrada.titulo,
                    valor: entrada.valor,
                    foto_base64: entrada.foto_base64,
                    foto_modelo: entrada.foto_modelo,
                    completed: entrada.completed || false,
                    created_at: entrada.created_at,
                    local: false
                  }));
                }
              });
            }
            
            const stepsWithData = steps.map(step => ({
              ...step,
              entradas: entriesData[step.id] || []
            }));
            
            console.log('✅ FALLBACK: Usando cache inicial após erro de servidor');
            return { data: stepsWithData, error: null, fromCache: true };
          }
        }
      } catch (fallbackError) {
        console.error('💥 Erro no fallback:', fallbackError);
      }
      
      return { data: null, error: `Erro de conexão: ${serverError}`, fromCache: false };
    }
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar etapas com cache:', error);
    return { data: null, error: `Erro inesperado: ${error}`, fromCache: false };
  }
};

/**
 * Faz cache dos dados do servidor USANDO ASYNCSTORAGE DIRETO
 */
const cacheServerData = async (tipoOsId: number, stepsWithData: ServiceStep[]): Promise<void> => {
  try {
    console.log('💾 Salvando dados no AsyncStorage direto (sem cache híbrido)...');
    
    // 1. Separar etapas das entradas
    const stepsOnly = stepsWithData.map(step => ({
      ...step,
      entradas: [] // Remover entradas para cache separado
    }));

    // 2. Organizar entradas por etapa
    const entriesByStep: any = {};
    stepsWithData.forEach(step => {
      if (step.entradas && step.entradas.length > 0) {
        entriesByStep[step.id] = step.entradas;
      }
    });

    // 3. Salvar etapas direto no AsyncStorage (SEM usar storageAdapter/cache)
    try {
      const stepsKey = `service_steps_${tipoOsId}`;
      await AsyncStorage.setItem(stepsKey, JSON.stringify(stepsOnly));
      console.log(`✅ ${stepsOnly.length} etapas salvas direto no AsyncStorage`);
    } catch (stepsError) {
      console.warn('⚠️ Erro ao salvar etapas no AsyncStorage:', stepsError);
    }

    // 4. Salvar entradas direto no AsyncStorage (SEM usar storageAdapter/cache)
    if (Object.keys(entriesByStep).length > 0) {
      try {
        const entriesKey = `service_entries_${tipoOsId}`;
        await AsyncStorage.setItem(entriesKey, JSON.stringify(entriesByStep));
        
        const totalEntries = Object.values(entriesByStep).reduce((sum: number, entries: any) => sum + entries.length, 0);
        console.log(`✅ ${totalEntries} entradas salvas direto no AsyncStorage`);
      } catch (entriesError) {
        console.warn('⚠️ Erro ao salvar entradas no AsyncStorage:', entriesError);
      }
    }
    
    console.log('✅ Cache direto no AsyncStorage concluído (sem sistema híbrido)');
  } catch (error) {
    console.error('💥 Erro ao fazer cache direto no AsyncStorage:', error);
    // Não fazer fallback para evitar o erro de database full
  }
};

/**
 * Pré-carrega e faz cache de etapas para todos os tipos de OS
 */
export const preloadAndCacheAllServiceSteps = async (): Promise<{ 
  success: boolean; 
  cached: number; 
  errors: string[] 
}> => {
  try {
    console.log('🔄 Iniciando pré-carregamento de etapas...');
    
    // Verificar conectividade
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected) {
      console.log('📱 Offline: pulando pré-carregamento');
      return { success: false, cached: 0, errors: ['Sem conexão'] };
    }

    // Buscar todos os tipos de OS únicos
    const { data: tiposOS, error: tiposError } = await supabase
      .from('etapa_os')
      .select('tipo_os_id')
      .not('tipo_os_id', 'is', null);

    if (tiposError || !tiposOS) {
      console.error('❌ Erro ao buscar tipos de OS:', tiposError);
      return { success: false, cached: 0, errors: [tiposError?.message || 'Erro desconhecido'] };
    }

    // Obter tipos únicos
    const uniqueTipos = [...new Set(tiposOS.map(t => t.tipo_os_id))];
    console.log(`📋 Encontrados ${uniqueTipos.length} tipos de OS únicos:`, uniqueTipos);

    let cached = 0;
    const errors: string[] = [];

    // Carregar e fazer cache para cada tipo
    for (const tipoId of uniqueTipos) {
      try {
        // Usar ordemServicoId = 0 para indicar pré-carregamento
        const result = await getServiceStepsWithData(tipoId, 0);
        
        if (result.data && !result.error && result.data.length > 0) {
          await cacheServerData(tipoId, result.data);
          cached++;
        }
      } catch (error) {
        const errorMsg = `Erro no tipo ${tipoId}: ${error}`;
        console.error('❌', errorMsg);
        errors.push(errorMsg);
      }
    }

    if (cached > 0) {
      console.log(`✅ ${cached} tipos de OS em cache`);
    }
    return { success: cached > 0, cached, errors };
  } catch (error) {
    console.error('💥 Erro no pré-carregamento:', error);
    return { success: false, cached: 0, errors: [error?.toString() || 'Erro desconhecido'] };
  }
};

/**
 * Converte foto para base64 para salvar na tabela dados
 */
const convertPhotoToBase64 = async (photoUri: string): Promise<{ base64: string | null; error: string | null }> => {
  try {
    if (!photoUri || typeof photoUri !== 'string') {
      return { base64: null, error: 'URI da foto inválido' };
    }

    const fileInfo = await FileSystem.getInfoAsync(photoUri);
    if (!fileInfo.exists) {
      return { base64: null, error: 'Arquivo de foto não encontrado' };
    }

    const base64 = await FileSystem.readAsStringAsync(photoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) {
      return { base64: null, error: 'Falha ao converter foto para base64' };
    }

    return { base64, error: null };
  } catch (error) {
    console.error('💥 Erro ao converter foto para base64:', error);
    return { base64: null, error: `Erro inesperado ao converter foto: ${error}` };
  }
};

/**
 * Salva dados de foto na tabela 'dados'
 * Suporta fotos normais (entrada_dados_id > 0) e fotos extras (entrada_dados_id = -1)
 */
export const saveDadosRecord = async (
  ordemServicoId: number,
  entradaDadosId: number | null,
  photoValue: string
): Promise<{ data: DadosRecord | null; error: string | null }> => {
  try {
    const isExtraPhoto = entradaDadosId === null;
    
    console.log('💾 Salvando dados na tabela dados...', {
      ordemServicoId,
      entradaDadosId: isExtraPhoto ? 'FOTO_EXTRA (null)' : entradaDadosId,
      photoValue: photoValue.substring(0, 50) + '...'
    });

    let base64ToSave: string;

    // Verificar se já é base64 ou se precisa converter
    if (photoValue.startsWith('data:image/')) {
      // Já é base64 com prefixo, extrair apenas o base64
      base64ToSave = photoValue.replace(/^data:image\/[a-z]+;base64,/, '');
      console.log('📸 Usando base64 fornecido diretamente');
    } else if (photoValue.startsWith('file://')) {
      // É um URI, precisa converter
      console.log('📸 Convertendo URI para base64...');
      const { base64, error: conversionError } = await convertPhotoToBase64(photoValue);
      if (conversionError || !base64) {
        console.error('❌ Erro na conversão para base64:', conversionError);
        return { data: null, error: `Erro na conversão da foto: ${conversionError}` };
      }
      base64ToSave = base64;
    } else {
      // Assumir que é base64 puro (sem prefixo)
      base64ToSave = photoValue;
      console.log('📸 Usando valor como base64 puro');
    }

    // Salvar na tabela dados
    const insertData = {
      ativo: 1,
      valor: base64ToSave,
      ordem_servico_id: ordemServicoId,
      entrada_dados_id: entradaDadosId, // null para fotos extras, number para fotos normais
      created_at: new Date().toISOString(),
      dt_edicao: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('dados')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('❌ Erro ao salvar na tabela dados:', error);
      return { data: null, error: error.message };
    }

    if (isExtraPhoto) {
      console.log('✅ Foto extra salva com sucesso na tabela dados:', data?.id);
    } else {
      console.log('✅ Dados salvos com sucesso na tabela dados:', data?.id);
    }
    
    return { data, error: null };

  } catch (error) {
    console.error('💥 Erro inesperado ao salvar dados:', error);
    return { data: null, error: 'Erro inesperado ao salvar dados' };
  }
};

/**
 * Salva comentário de uma etapa na tabela comentario_etapa
 */
export const saveComentarioEtapa = async (
  ordemServicoId: number,
  etapaId: number,
  comentario: string
): Promise<{ data: ComentarioEtapa | null; error: string | null }> => {
  try {
    console.log('💬 Salvando comentário da etapa...', {
      ordemServicoId,
      etapaId,
      comentarioLength: comentario.length
    });

    // Verificar se já existe comentário para esta etapa e OS
    const { data: existingComment, error: searchError } = await supabase
      .from('comentario_etapa')
      .select('*')
      .eq('ordem_servico_id', ordemServicoId)
      .eq('etapa_id', etapaId)
      .single();

    if (searchError && searchError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ Erro ao buscar comentário existente:', searchError);
      return { data: null, error: searchError.message };
    }

    if (existingComment) {
      // Atualizar comentário existente
      const { data, error } = await supabase
        .from('comentario_etapa')
        .update({
          comentario: comentario,
          dt_edicao: new Date().toISOString(),
        })
        .eq('id', existingComment.id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar comentário da etapa:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Comentário da etapa atualizado com sucesso:', data?.id);
      return { data, error: null };
    } else {
      // Criar novo comentário
      const { data, error } = await supabase
        .from('comentario_etapa')
        .insert({
          ordem_servico_id: ordemServicoId,
          etapa_id: etapaId,
          comentario: comentario,
          created_at: new Date().toISOString(),
          dt_edicao: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao salvar comentário da etapa:', error);
        return { data: null, error: error.message };
      }

      console.log('✅ Comentário da etapa salvo com sucesso:', data?.id);
      return { data, error: null };
    }

  } catch (error) {
    console.error('💥 Erro inesperado ao salvar comentário da etapa:', error);
    return { data: null, error: 'Erro inesperado ao salvar comentário da etapa' };
  }
};

/**
 * Busca comentário de uma etapa específica
 */
export const getComentarioEtapa = async (
  ordemServicoId: number,
  etapaId: number
): Promise<{ data: ComentarioEtapa | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('comentario_etapa')
      .select('*')
      .eq('ordem_servico_id', ordemServicoId)
      .eq('etapa_id', etapaId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ Erro ao buscar comentário da etapa:', error);
      return { data: null, error: error.message };
    }

    return { data: data || null, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar comentário da etapa:', error);
    return { data: null, error: 'Erro inesperado ao buscar comentário da etapa' };
  }
};

/**
 * Busca fotos já salvas pelo usuário na tabela dados
 */
export const getFotosSalvasUsuario = async (
  ordemServicoId: number,
  entradaDadosIds: number[]
): Promise<{ data: { [entradaId: number]: string } | null; error: string | null }> => {
  try {
    if (!entradaDadosIds || entradaDadosIds.length === 0) {
      return { data: {}, error: null };
    }

    const { data, error } = await supabase
      .from('dados')
      .select('entrada_dados_id, valor')
      .eq('ordem_servico_id', ordemServicoId)
      .in('entrada_dados_id', entradaDadosIds)
      .eq('ativo', 1)
      .order('created_at', { ascending: false }); // Mais recente primeiro

    if (error) {
      console.error('❌ Erro ao buscar fotos salvas do usuário:', error);
      return { data: null, error: error.message };
    }

    // Organizar por entrada_dados_id (se houver múltiplas fotos, pega a mais recente)
    const fotosPorEntrada: { [entradaId: number]: string } = {};
    
    data?.forEach(registro => {
      if (!fotosPorEntrada[registro.entrada_dados_id] && registro.valor) {
        // Formatar foto para exibição (adicionar prefixo se necessário)
        const fotoFormatada = registro.valor.startsWith('data:image/') 
          ? registro.valor 
          : `data:image/jpeg;base64,${registro.valor}`;
        
        fotosPorEntrada[registro.entrada_dados_id] = fotoFormatada;
      }
    });

    console.log(`📸 ${Object.keys(fotosPorEntrada).length} fotos do usuário carregadas`);
    return { data: fotosPorEntrada, error: null };

  } catch (error) {
    console.error('💥 Erro inesperado ao buscar fotos salvas do usuário:', error);
    return { data: null, error: 'Erro inesperado ao buscar fotos salvas do usuário' };
  }
}; 

/**
 * Salva foto extra de uma etapa - REMOVIDA
 * Fotos extras são salvas apenas offline no AsyncStorage
 * pois não têm entrada correspondente na tabela entrada_dados
 */
// Função removida para evitar erro de foreign key constraint
// Fotos extras são gerenciadas apenas offline via AsyncStorage 