export interface UserStats {
  totalWorkOrders: number;
  ranking: number;
  completionRate: number;
}

export interface Audit {
  id: string;
  supabaseId: string;
  title: string;
  status: 'pendente' | 'concluida' | 'em_andamento' | 'cancelada';
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileData {
  user: {
    id: string;
    name: string;
    role: string;
    avatar?: string;
  };
  stats: UserStats;
  audits: Audit[];
} 