export interface WorkOrder {
  id: string;
  title: string;
  client: string;
  address: string;
  priority: 'alta' | 'media' | 'baixa';
  status: 'todas' | 'aguardando' | 'em_progresso' | 'finalizada';
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  name: string;
  role: string;
  userType: 'gestor' | 'tecnico';
  avatar?: string;
}

export type FilterStatus = 'todas' | 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada' | 'atrasada'; 