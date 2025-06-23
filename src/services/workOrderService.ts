import { supabase } from './supabase';
import { WorkOrder, FilterStatus } from '../types/workOrder';

export interface SupabaseWorkOrder {
  id: number;
  created_at: string;
  dt_adicao: string;
  dt_edicao: string | null;
  os_status_txt: string;
  os_prioridade: string;
  os_motivo_descricao: string;
  os_observacao: string | null;
  os_conteudo: string;
  endereco_bairro: string | null;
  endereco_logradouro: string;
  cliente_id: number;
  cliente: {
    nome: string;
  };
  data_agendamento: string;
  tipo_os_id: number;
  supervisor_id: number;
  tecnico_resp_id: number;
  tecnico_aux_id: number;
  ativo: number;
  sync: number;
  avaliado: number;
}

// Função para mapear prioridade do número para texto
const mapPriority = (prioridade: string): 'alta' | 'media' | 'baixa' => {
  switch (prioridade) {
    case '1':
      return 'alta';
    case '2':
      return 'media';
    case '3':
      return 'baixa';
    default:
      return 'media';
  }
};

// Função para mapear status do texto para formato padrão
const mapStatus = (status: string): 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada' => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('progresso') || statusLower.includes('andamento')) {
    return 'em_progresso';
  }
  if (statusLower.includes('encerrada') || statusLower.includes('finalizada')) {
    return 'finalizada';
  }
  if (statusLower.includes('cancelada')) {
    return 'cancelada';
  }
  return 'aguardando';
};

// Função para mapear dados do Supabase para o formato da aplicação
const mapSupabaseToWorkOrder = (supabaseOrder: SupabaseWorkOrder, supervisorName?: string, isEvaluated?: boolean): WorkOrder => {
  // Montar endereço completo
  const endereco = supabaseOrder.endereco_bairro 
    ? `${supabaseOrder.endereco_logradouro}, ${supabaseOrder.endereco_bairro}`
    : supabaseOrder.endereco_logradouro;

  return {
    id: supabaseOrder.id,
    title: supabaseOrder.os_motivo_descricao,
    client: supabaseOrder.cliente?.nome || 'Cliente não encontrado',
    address: endereco,
    priority: mapPriority(supabaseOrder.os_prioridade),
    status: mapStatus(supabaseOrder.os_status_txt),
    scheduling_date: new Date(supabaseOrder.data_agendamento),
    sync: supabaseOrder.sync,
    createdAt: new Date(supabaseOrder.created_at),
    updatedAt: new Date(supabaseOrder.dt_edicao || supabaseOrder.created_at),
    os_conteudo: supabaseOrder.os_conteudo,
    tipo_os_id: supabaseOrder.tipo_os_id,
    supervisor_id: supabaseOrder.supervisor_id,
    supervisor_name: supervisorName || 'Supervisor não encontrado',
    is_evaluated: isEvaluated || false,
  };
};

// Buscar todas as ordens de serviço com informações de supervisor e avaliação
export const fetchWorkOrders = async (): Promise<{ data: WorkOrder[] | null; error: string | null; fromCache?: boolean }> => {
  try {
    console.log('🔍 Buscando todas as ordens de serviço com supervisor e avaliações...');
    
    const { data, error } = await supabase
      .from('ordem_servico')
      .select(`
        *,
        cliente:cliente_id (
          nome
        ),
        supervisor:supervisor_id (
          nome
        )
      `)
      .eq('ativo', 1) // Apenas OS ativas
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar ordens de serviço:', error);
      return { data: null, error: error.message };
    }

    // Buscar todas as avaliações para verificar quais OS foram avaliadas
    const { data: evaluations, error: evaluationError } = await supabase
      .from('avaliacao_os')
      .select('ordem_servico_id');

    if (evaluationError) {
      console.warn('⚠️ Erro ao buscar avaliações, continuando sem essa informação:', evaluationError);
    }

    // Criar Set com IDs das OS avaliadas para lookup rápido
    const evaluatedOsIds = new Set(evaluations?.map(evaluation => evaluation.ordem_servico_id) || []);

    const workOrders = data?.map(order => {
      const supervisorName = (order as any).supervisor?.nome || 'Supervisor não encontrado';
      const isEvaluated = evaluatedOsIds.has(order.id);
      return mapSupabaseToWorkOrder(order, supervisorName, isEvaluated);
    }) || [];

    console.log(`✅ ${workOrders.length} ordens de serviço carregadas com supervisor e avaliações`);
    return { data: workOrders, error: null, fromCache: false };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar ordens de serviço:', error);
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço', fromCache: false };
  }
};

// Buscar ordens de serviço por usuário (técnico)
export const fetchWorkOrdersByTechnician = async (userId: string): Promise<{ data: WorkOrder[] | null; error: string | null; fromCache?: boolean }> => {
  try {
    console.log(`🔍 Buscando ordens de serviço do técnico ${userId}...`);
    
    const { data, error } = await supabase
      .from('ordem_servico')
      .select(`
        *,
        cliente:cliente_id (
          nome
        ),
        supervisor:supervisor_id (
          nome
        )
      `)
      .eq('tecnico_resp_id', parseInt(userId)) // userId já é o ID numérico
      .eq('ativo', 1) // Apenas OS ativas
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar ordens de serviço do técnico:', error);
      return { data: null, error: error.message };
    }

    // Buscar avaliações para as OS do técnico
    const osIds = data?.map(order => order.id) || [];
    let evaluatedOsIds = new Set<number>();

    if (osIds.length > 0) {
      const { data: evaluations, error: evaluationError } = await supabase
        .from('avaliacao_os')
        .select('ordem_servico_id')
        .in('ordem_servico_id', osIds);

      if (evaluationError) {
        console.warn('⚠️ Erro ao buscar avaliações, continuando sem essa informação:', evaluationError);
      } else {
        evaluatedOsIds = new Set(evaluations?.map(evaluation => evaluation.ordem_servico_id) || []);
      }
    }

    const workOrders = data?.map(order => {
      const supervisorName = (order as any).supervisor?.nome || 'Supervisor não encontrado';
      const isEvaluated = evaluatedOsIds.has(order.id);
      return mapSupabaseToWorkOrder(order, supervisorName, isEvaluated);
    }) || [];

    console.log(`✅ ${workOrders.length} ordens de serviço do técnico carregadas`);
    return { data: workOrders, error: null, fromCache: false };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar ordens de serviço do técnico:', error);
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço do técnico', fromCache: false };
  }
};

// Buscar ordens de serviço com filtros
export const fetchWorkOrdersWithFilters = async (
  userId?: string,
  status?: FilterStatus,
  search?: string
): Promise<{ data: WorkOrder[] | null; error: string | null; fromCache?: boolean }> => {
  try {
    console.log(`🔍 Buscando ordens com filtros - User: ${userId}, Status: ${status}, Search: ${search}...`);
    
    // Verificar conectividade primeiro
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected) {
      console.log('📱 Offline: não é possível buscar ordens de serviço');
      return { data: [], error: null, fromCache: false };
    }
    
    let query = supabase
      .from('ordem_servico')
      .select(`
        *,
        cliente:cliente_id (
          nome
        ),
        supervisor:supervisor_id (
          nome
        )
      `)
      .eq('ativo', 1);

    // Filtrar por usuário se fornecido
    if (userId) {
      console.log('🔢 Usando ID numérico do usuário:', userId);
      query = query.eq('tecnico_resp_id', parseInt(userId));
    }

    // Filtrar por status se não for 'todas'
    if (status && status !== 'todas') {
      // Mapear status para o formato da tabela
      let dbStatus = '';
      switch (status) {
        case 'aguardando':
          dbStatus = 'Aguardando';
          break;
        case 'em_progresso':
          dbStatus = 'Em progresso';
          break;
        case 'finalizada':
          dbStatus = 'Encerrada';
          break;
        case 'cancelada':
          dbStatus = 'Cancelada';
          break;
      }
      if (dbStatus) {
        query = query.eq('os_status_txt', dbStatus);
      }
    }

    // Busca por texto
    if (search && search.trim()) {
      const searchTerm = search.trim();
      
      // Verificar se o termo de busca é um número (para buscar por ID)
      const isNumeric = /^\d+$/.test(searchTerm);
      
      if (isNumeric) {
        // Se for número, buscar por ID exato ou título
        query = query.or(`os_motivo_descricao.ilike.%${searchTerm}%,id.eq.${searchTerm}`);
      } else {
        // Se contém texto, buscar por ID parcial ou título
        // Permite buscar tanto por título quanto por ID que contenha os números
        const numericPart = searchTerm.replace(/[^\d]/g, '');
        if (numericPart) {
          query = query.or(`os_motivo_descricao.ilike.%${searchTerm}%,id::text.ilike.%${numericPart}%`);
        } else {
          query = query.ilike('os_motivo_descricao', `%${searchTerm}%`);
        }
      }
    }

    // Adicionar timeout de 10 segundos
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: requisição demorou mais que 30 segundos')), 30000);
    });

    const queryPromise = query.order('created_at', { ascending: false });
    
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

    if (error) {
      console.error('❌ Erro ao buscar ordens de serviço com filtros:', error);
      return { data: null, error: error.message };
    }

    // Buscar avaliações para as OS filtradas
    const osIds = data?.map(order => order.id) || [];
    let evaluatedOsIds = new Set<number>();

    if (osIds.length > 0) {
      const { data: evaluations, error: evaluationError } = await supabase
        .from('avaliacao_os')
        .select('ordem_servico_id')
        .in('ordem_servico_id', osIds);

      if (evaluationError) {
        console.warn('⚠️ Erro ao buscar avaliações, continuando sem essa informação:', evaluationError);
      } else {
        evaluatedOsIds = new Set(evaluations?.map(evaluation => evaluation.ordem_servico_id) || []);
      }
    }

    const workOrders = data?.map(order => {
      const supervisorName = (order as any).supervisor?.nome || 'Supervisor não encontrado';
      const isEvaluated = evaluatedOsIds.has(order.id);
      return mapSupabaseToWorkOrder(order, supervisorName, isEvaluated);
    }) || [];

    console.log(`✅ ${workOrders.length} ordens de serviço com filtros carregadas`);
    return { data: workOrders, error: null, fromCache: false };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar ordens de serviço com filtros:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado ao buscar ordens de serviço com filtros';
    return { data: null, error: errorMessage, fromCache: false };
  }
};

// Atualizar status de uma ordem de serviço
export const updateWorkOrderStatus = async (
  id: string, 
  status: 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada'
): Promise<{ data: WorkOrder | null; error: string | null }> => {
  try {
    // Mapear status para o formato da tabela
    let dbStatus = '';
    switch (status) {
      case 'aguardando':
        dbStatus = 'Aguardando';
        break;
      case 'em_progresso':
        dbStatus = 'Em progresso';
        break;
      case 'finalizada':
        dbStatus = 'Encerrada';
        break;
      case 'cancelada':
        dbStatus = 'Cancelada';
        break;
    }

    const { data, error } = await supabase
      .from('ordem_servico')
      .update({ 
        os_status_txt: dbStatus,
        dt_edicao: new Date().toISOString() 
      })
      .eq('id', parseInt(id))
      .select(`
        *,
        cliente:cliente_id (
          nome
        ),
        supervisor:supervisor_id (
          nome
        )
      `)
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar status da ordem de serviço:', error);
      return { data: null, error: error.message };
    }

    // Verificar se a OS foi avaliada
    const { data: evaluation, error: evaluationError } = await supabase
      .from('avaliacao_os')
      .select('ordem_servico_id')
      .eq('ordem_servico_id', parseInt(id))
      .single();

    const isEvaluated = !evaluationError && evaluation;
    const supervisorName = (data as any).supervisor?.nome || 'Supervisor não encontrado';

    const workOrder = mapSupabaseToWorkOrder(data, supervisorName, isEvaluated);
    console.log(`✅ Status da OS ${id} atualizado para ${status}`);
    
    return { data: workOrder, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao atualizar status da ordem de serviço:', error);
    return { data: null, error: 'Erro inesperado ao atualizar status da ordem de serviço' };
  }
};

// Funções de cache (mantidas para compatibilidade, mas sem funcionalidade)
export const invalidateWorkOrdersCache = async (): Promise<void> => {
  console.log('🗑️ Cache invalidation (sem funcionalidade no momento)');
};

export const refreshWorkOrdersCache = async (): Promise<void> => {
  console.log('🔄 Cache refresh (sem funcionalidade no momento)');
};

export const getCacheStats = async (): Promise<{
  hasCache: boolean;
  cacheAge: number;
  lastSync: number;
}> => {
  return {
    hasCache: false,
    cacheAge: 0,
    lastSync: 0
  };
};

/**
 * EXEMPLO DE USO DO NOVO SISTEMA DE PRÉ-CARREGAMENTO:
 * 
 * 1. Na MainScreen, quando as OSs são carregadas, automaticamente 
 *    chama preloadWorkOrdersData() para carregar:
 *    - Todas as etapas de cada tipo de OS
 *    - Todas as entradas de cada etapa
 *    - Todas as fotos modelo
 *    - Dados de cache local
 * 
 * 2. O pré-carregamento é inteligente:
 *    - Só roda se necessário (novas OSs ou cache expirado)
 *    - Roda em background sem travar a UI
 *    - Mostra progresso para o usuário
 *    - Funciona offline (usa cache existente)
 * 
 * 3. Benefícios para o técnico:
 *    - Ao sair para campo, TODOS os dados já estão locais
 *    - Funciona 100% offline após o pré-carregamento
 *    - Fotos modelo, etapas, checklists tudo disponível
 *    - Sincronização automática quando retorna online
 * 
 * 4. Fluxo típico:
 *    - Técnico abre app na empresa (com wifi)
 *    - App carrega OSs e pré-carrega TUDO automaticamente
 *    - Técnico sai para campo sem internet
 *    - Tudo funciona normalmente (etapas, fotos, etc.)
 *    - Ao retornar com internet, tudo sincroniza
 */ 