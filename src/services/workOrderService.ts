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
const mapSupabaseToWorkOrder = (supabaseOrder: SupabaseWorkOrder): WorkOrder => {
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
  };
};

// Buscar todas as ordens de serviço
export const fetchWorkOrders = async (): Promise<{ data: WorkOrder[] | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('ordem_servico')
      .select('*')
      .eq('ativo', 1) // Apenas OS ativas
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar ordens de serviço:', error);
      return { data: null, error: error.message };
    }

    const workOrders = data?.map(mapSupabaseToWorkOrder) || [];
    return { data: workOrders, error: null };
  } catch (error) {
    console.error('Erro inesperado ao buscar ordens de serviço:', error);
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço' };
  }
};

// Buscar ordens de serviço por usuário (técnico)
export const fetchWorkOrdersByTechnician = async (userId: string): Promise<{ data: WorkOrder[] | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('ordem_servico')
      .select('*')
      .eq('tecnico_resp_id', parseInt(userId)) // userId já é o ID numérico
      .eq('ativo', 1) // Apenas OS ativas
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar ordens de serviço do técnico:', error);
      return { data: null, error: error.message };
    }

    const workOrders = data?.map(mapSupabaseToWorkOrder) || [];
    return { data: workOrders, error: null };
  } catch (error) {
    console.error('Erro inesperado ao buscar ordens de serviço do técnico:', error);
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço do técnico' };
  }
};

// Buscar ordens de serviço com filtros
export const fetchWorkOrdersWithFilters = async (
  userId?: string,
  status?: FilterStatus,
  search?: string
): Promise<{ data: WorkOrder[] | null; error: string | null }> => {
  try {
    let query = supabase
      .from('ordem_servico')
      .select(`
        *,
        cliente:cliente_id (
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
        // Se for número, buscar por ID ou título
        query = query.or(`os_motivo_descricao.ilike.%${searchTerm}%,id.eq.${searchTerm}`);
      } else {
        // Se for texto, buscar apenas por título
        query = query.ilike('os_motivo_descricao', `%${searchTerm}%`);
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar ordens de serviço com filtros:', error);
      return { data: null, error: error.message };
    }

    const workOrders = data?.map(mapSupabaseToWorkOrder) || [];
    return { data: workOrders, error: null };
  } catch (error) {
    console.error('Erro inesperado ao buscar ordens de serviço com filtros:', error);
    return { data: null, error: 'Erro inesperado ao buscar ordens de serviço com filtros' };
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
      .select('*')
      .single();

    if (error) {
      console.error('Erro ao atualizar status da ordem de serviço:', error);
      return { data: null, error: error.message };
    }

    const workOrder = mapSupabaseToWorkOrder(data);
    return { data: workOrder, error: null };
  } catch (error) {
    console.error('Erro inesperado ao atualizar status da ordem de serviço:', error);
    return { data: null, error: 'Erro inesperado ao atualizar status da ordem de serviço' };
  }
}; 