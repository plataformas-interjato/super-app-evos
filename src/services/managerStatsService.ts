import { supabase } from './supabase';

export interface UserStats {
  totalFinalized: number;
  totalAudited: number;
  totalNotAudited: number;
  osStats: {
    executed: number;
    delayed: number;
    pending: number;
  };
}

export const getStatsForUserType = async (funcaoOriginal: string, userId: string): Promise<UserStats> => {
  try {
    console.log(`📊 Carregando estatísticas para função "${funcaoOriginal}":`, userId);

    const funcao = funcaoOriginal?.toLowerCase();
    
    if (funcao === 'supervisor') {
      return await getSupervisorStats(userId);
    } else if (funcao === 'gestor') {
      return await getGestorStats();
    } else {
      // Para outras funções, tratar como técnico (retornar estatísticas básicas)
      return await getTecnicoStats(userId);
    }
  } catch (error) {
    console.error('💥 Erro ao carregar estatísticas:', error);
    // Retornar dados padrão em caso de erro
    return {
      totalFinalized: 0,
      totalAudited: 0,
      totalNotAudited: 0,
      osStats: {
        executed: 0,
        delayed: 0,
        pending: 0,
      },
    };
  }
};

const getSupervisorStats = async (userId: string): Promise<UserStats> => {
  console.log('👨‍💼 Carregando estatísticas do supervisor:', userId);

  // 1. Buscar OS finalizadas onde o usuário atual é supervisor
  const { data: finalizedOrders, error: finalizedError } = await supabase
    .from('ordem_servico')
    .select('id, data_agendamento')
    .eq('supervisor_id', parseInt(userId))
    .eq('os_status_txt', 'Encerrada')
    .eq('ativo', 1);

  if (finalizedError) {
    console.error('❌ Erro ao buscar OS finalizadas do supervisor:', finalizedError);
    throw finalizedError;
  }

  const totalFinalized = finalizedOrders?.length || 0;
  console.log(`✅ ${totalFinalized} OS finalizadas encontradas para o supervisor`);

  // 2. Buscar OS auditadas das OS do supervisor
  const supervisedOrderIds = finalizedOrders?.map(order => order.id) || [];
  
  let totalAudited = 0;
  
  if (supervisedOrderIds.length > 0) {
    const { data: auditedOrders, error: auditedError } = await supabase
      .from('avaliacao_os')
      .select('ordem_servico_id')
      .in('ordem_servico_id', supervisedOrderIds);

    if (auditedError) {
      console.error('❌ Erro ao buscar OS auditadas do supervisor:', auditedError);
      throw auditedError;
    }

    // Contar avaliações únicas
    const uniqueAuditedIds = new Set(auditedOrders?.map(audit => audit.ordem_servico_id) || []);
    totalAudited = uniqueAuditedIds.size;
    console.log(`✅ ${totalAudited} OS auditadas encontradas para o supervisor`);
  }

  // 3. Calcular OS não auditadas (diferença entre finalizadas e auditadas)
  const totalNotAudited = totalFinalized - totalAudited;

  // 4. Para as estatísticas gerais, usar todas as OS do sistema
  const allStats = await getAllSystemStats();

  return {
    totalFinalized,
    totalAudited,
    totalNotAudited,
    osStats: allStats,
  };
};

const getGestorStats = async (): Promise<UserStats> => {
  console.log('👨‍💼 Carregando estatísticas do gestor');

  // 1. Buscar todas as OS finalizadas (gestor vê todas)
  const { data: allFinalizedOrders, error: finalizedError } = await supabase
    .from('ordem_servico')
    .select('id, data_agendamento')
    .eq('os_status_txt', 'Encerrada')
    .eq('ativo', 1);

  if (finalizedError) {
    console.error('❌ Erro ao buscar todas as OS finalizadas:', finalizedError);
    throw finalizedError;
  }

  const totalFinalized = allFinalizedOrders?.length || 0;
  console.log(`✅ ${totalFinalized} OS realizadas encontradas para o gestor`);

  // 2. Buscar todas as OS auditadas
  const { data: allAuditedOrders, error: auditedError } = await supabase
    .from('avaliacao_os')
    .select('ordem_servico_id');

  if (auditedError) {
    console.error('❌ Erro ao buscar todas as OS auditadas:', auditedError);
    throw auditedError;
  }

  const uniqueAuditedIds = new Set(allAuditedOrders?.map((audit: any) => audit.ordem_servico_id) || []);
  const totalAudited = uniqueAuditedIds.size;
  console.log(`✅ ${totalAudited} OS auditadas encontradas para o gestor`);

  // 3. Calcular OS não auditadas
  const totalNotAudited = totalFinalized - totalAudited;

  // 4. Estatísticas gerais
  const allStats = await getAllSystemStats();

  return {
    totalFinalized,
    totalAudited,
    totalNotAudited,
    osStats: allStats,
  };
};

const getAllSystemStats = async () => {
  // Buscar todas as OS finalizadas para calcular estatísticas gerais
  const { data: allFinalizedOrders, error: finalizedError } = await supabase
    .from('ordem_servico')
    .select('id, data_agendamento')
    .eq('os_status_txt', 'Encerrada')
    .eq('ativo', 1);

  if (finalizedError) {
    console.error('❌ Erro ao buscar OS para estatísticas gerais:', finalizedError);
    throw finalizedError;
  }

  // Buscar todas as OS auditadas
  const { data: allAuditedOrders, error: auditedError } = await supabase
    .from('avaliacao_os')
    .select('ordem_servico_id');

  if (auditedError) {
    console.error('❌ Erro ao buscar OS auditadas para estatísticas gerais:', auditedError);
    throw auditedError;
  }

  const allAuditedIds = new Set(allAuditedOrders?.map((audit: any) => audit.ordem_servico_id) || []);

  // Calcular OS atrasadas (finalizadas com data_agendamento anterior ao dia atual e não avaliadas)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const delayedOrders = allFinalizedOrders?.filter(order => {
    if (!order.data_agendamento) return false;
    
    const scheduledDate = new Date(order.data_agendamento);
    scheduledDate.setHours(0, 0, 0, 0);
    
    const isOverdue = scheduledDate < today;
    const isNotEvaluated = !allAuditedIds.has(order.id);
    
    return isOverdue && isNotEvaluated;
  }) || [];

  // Calcular OS pendentes de avaliação (todas as finalizadas que não foram avaliadas)
  const pendingOrders = allFinalizedOrders?.filter(order => 
    !allAuditedIds.has(order.id)
  ) || [];

  const totalExecuted = allFinalizedOrders?.length || 0;
  const totalDelayed = delayedOrders.length;
  const totalPending = pendingOrders.length;

  console.log(`📊 Estatísticas gerais: ${totalExecuted} executadas, ${totalDelayed} atrasadas, ${totalPending} pendentes`);

  return {
    executed: totalExecuted,
    delayed: totalDelayed,
    pending: totalPending,
  };
};

const getTecnicoStats = async (userId: string): Promise<UserStats> => {
  console.log('👨‍🔧 Carregando estatísticas do técnico:', userId);

  // Para técnicos, mostrar apenas suas próprias OS
  const { data: technicianOrders, error: technicianError } = await supabase
    .from('ordem_servico')
    .select('id, data_agendamento')
    .or(`tecnico_resp_id.eq.${userId},tecnico_aux_id.eq.${userId}`)
    .eq('os_status_txt', 'Encerrada')
    .eq('ativo', 1);

  if (technicianError) {
    console.error('❌ Erro ao buscar OS do técnico:', technicianError);
    throw technicianError;
  }

  const totalFinalized = technicianOrders?.length || 0;
  console.log(`✅ ${totalFinalized} OS finalizadas encontradas para o técnico`);

  // Buscar avaliações das OS do técnico
  const technicianOrderIds = technicianOrders?.map(order => order.id) || [];
  
  let totalAudited = 0;
  
  if (technicianOrderIds.length > 0) {
    const { data: auditedOrders, error: auditedError } = await supabase
      .from('avaliacao_os')
      .select('ordem_servico_id')
      .in('ordem_servico_id', technicianOrderIds);

    if (auditedError) {
      console.error('❌ Erro ao buscar OS auditadas do técnico:', auditedError);
      throw auditedError;
    }

    const uniqueAuditedIds = new Set(auditedOrders?.map(audit => audit.ordem_servico_id) || []);
    totalAudited = uniqueAuditedIds.size;
    console.log(`✅ ${totalAudited} OS auditadas encontradas para o técnico`);
  }

  const totalNotAudited = totalFinalized - totalAudited;

  // Para estatísticas gerais, usar apenas as OS do técnico (não do sistema todo)
  const technicianStats = {
    executed: totalFinalized,
    delayed: 0, // Calcular depois se necessário
    pending: totalNotAudited,
  };

  return {
    totalFinalized,
    totalAudited,
    totalNotAudited,
    osStats: technicianStats,
  };
}; 