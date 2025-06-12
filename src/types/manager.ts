export interface ManagerStats {
  totalEvaluated: number;
  ranking: number;
  executed: {
    count: number;
    percentage: number;
  };
  delayed: {
    count: number;
    percentage: number;
  };
  pending: {
    count: number;
    percentage: number;
  };
  lastUpdate: string;
}

export interface PieChartData {
  executed: number;
  delayed: number;
  pending: number;
} 