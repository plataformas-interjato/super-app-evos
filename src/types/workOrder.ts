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
}

export interface User {
  id: string; // ID numérico da tabela usuario
  uuid?: string; // UUID do Supabase Auth (referência)
  name: string;
  role: string;
  userType: 'gestor' | 'tecnico';
  avatar?: string;
  url_foto?: string;
}

export type FilterStatus = 'todas' | 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada' | 'atrasada'; 