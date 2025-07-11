export interface WorkOrder {
  id: number;
  title: string;
  client: string;
  address: string;
  status: 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada';
  priority: 'alta' | 'media' | 'baixa';
  scheduling_date: Date;
  sync: number;
  createdAt: Date;
  updatedAt: Date;
  os_conteudo?: string;
  tipo_os_id?: number; // FK para tipo_os
  supervisor_id?: number; // ID do supervisor
  supervisor_name?: string; // Nome do supervisor
  is_evaluated?: boolean; // Se a OS foi avaliada
  // Campos para OSs finalizadas
  tecnico_principal?: string; // Nome do técnico principal
  tecnico_auxiliar?: string; // Nome do técnico auxiliar
  tempo_execucao?: string; // Tempo de execução (ex: "40min")
  data_inicio?: Date; // Data/hora de início
  data_finalizacao?: Date; // Data/hora de finalização
}

export interface User {
  id: string; // ID numérico da tabela usuario
  uuid?: string; // UUID do Supabase Auth (referência)
  name: string;
  role: string;
  userType: 'gestor' | 'tecnico';
  avatar?: string;
  url_foto?: string;
  funcao_original?: string; // Função original da tabela usuario
}

export type FilterStatus = 'todas' | 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada' | 'atrasada'; 