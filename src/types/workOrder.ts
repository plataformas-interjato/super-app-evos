export interface WorkOrder {
  id: string;
  title: string;
  client: string;
  address: string;
  priority: 'alta' | 'media' | 'baixa';
  status: 'todas' | 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada';
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  numericId?: number;
  name: string;
  role: string;
  userType: 'gestor' | 'tecnico';
  avatar?: string;
  url_foto?: string;
}

export type FilterStatus = 'todas' | 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada'; 