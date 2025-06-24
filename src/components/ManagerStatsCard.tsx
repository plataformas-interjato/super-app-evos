import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';

interface RealManagerStats {
  executed: number; // Todas OS finalizadas
  delayed: number;  // OS finalizadas há mais de 1 dia sem avaliação
  pending: number;  // OS pendentes de avaliação
}

interface ManagerStatsCardProps {
  funcaoUsuario: string; // Função real do usuário (gestor, supervisor, tecnico, etc.)
  realStats?: {
    totalFinalized: number;
    totalAudited: number;
    totalNotAudited: number;
    osStats: RealManagerStats;
  };
}

const ManagerStatsCard: React.FC<ManagerStatsCardProps> = ({ funcaoUsuario, realStats }) => {
  // Função para formatar porcentagens com zero à esquerda
  const formatPercentage = (num: number): string => {
    const rounded = Math.round(num);
    return rounded < 10 ? `0${rounded}%` : `${rounded}%`;
  };

  // Usar dados reais se disponíveis, senão usar dados estáticos
  const statsData = realStats || {
    totalFinalized: 0,
    totalAudited: 0,
    totalNotAudited: 0,
    osStats: {
      executed: 0,
      delayed: 0,
      pending: 0,
    },
  };

  // Função para obter os labels baseados na função real do usuário
  const getLabels = () => {
    const funcao = funcaoUsuario?.toLowerCase();
    
    switch (funcao) {
      case 'supervisor':
        return {
          first: 'Supervisionadas',
          second: 'Auditadas',
          third: 'Não auditadas',
        };
      case 'gestor':
        return {
          first: 'Realizadas',
          second: 'Auditadas',
          third: 'Não auditadas',
        };
      case 'tecnico':
        return {
          first: 'Executadas',
          second: 'Avaliadas',
          third: 'Pendentes',
        };
      default:
        return {
          first: 'Finalizadas',
          second: 'Auditadas',
          third: 'Não auditadas',
        };
    }
  };

  const labels = getLabels();

  // Calcular percentuais dos dados
  const calculatePercentages = () => {
    const { executed, delayed, pending } = statsData.osStats;
    const total = executed + delayed + pending;

    if (total === 0) {
      return { executed: 0, delayed: 0, pending: 0 };
    }

    return {
      executed: (executed / total) * 100,
      delayed: (delayed / total) * 100,
      pending: (pending / total) * 100,
    };
  };

  const percentages = calculatePercentages();
  const osData = statsData.osStats;

  return (
    <View style={styles.container}>
      {/* Card de Informações do Usuário */}
      <View style={styles.userInfoCard}>
        <View style={styles.userInfoHeader}>
          <View style={styles.titleContainer}>
            <Ionicons name="analytics-outline" size={20} color="#3b82f6" />
            <Text style={styles.userInfoTitle}>Estatísticas das OS</Text>
          </View>
        </View>
        
        <View style={styles.userStatsRow}>
          <View style={styles.userStatItem}>
            <View style={styles.numberRow}>
              <View style={[styles.statIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              </View>
              <Text style={styles.userStatNumber}>
                {statsData.totalFinalized}
              </Text>
            </View>
            <Text style={styles.userStatLabel}>{labels.first}</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.userStatItem}>
            <View style={styles.numberRow}>
              <View style={[styles.statIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Ionicons name="star" size={20} color="#f59e0b" />
              </View>
              <Text style={styles.userStatNumber}>
                {statsData.totalAudited}
              </Text>
            </View>
            <Text style={styles.userStatLabel}>{labels.second}</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.userStatItem}>
            <View style={styles.numberRow}>
              <View style={[styles.statIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
              </View>
              <Text style={styles.userStatNumber}>
                {statsData.totalNotAudited}
              </Text>
            </View>
            <Text style={styles.userStatLabel}>{labels.third}</Text>
          </View>
        </View>
      </View>

      {/* Card de Estatísticas Gerais com Gráfico Pizza */}
      <View style={styles.statsCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.chartTitle}>Distribuição das OS</Text>
        </View>
        
        <View style={styles.chartContainer}>
          {/* Indicadores laterais otimizados */}
          <View style={styles.indicators}>
            <View style={styles.indicatorItem}>
              <View style={styles.indicatorRow}>
                <View style={styles.leftContent}>
                  <View style={[styles.indicatorDot, { backgroundColor: '#3b82f6' }]} />
                  <Text style={styles.indicatorNumber}>{osData.executed}</Text>
                </View>
              </View>
              <Text style={styles.indicatorLabel}>Executadas</Text>
            </View>
            
            <View style={styles.indicatorItem}>
              <View style={styles.indicatorRow}>
                <View style={styles.leftContent}>
                  <View style={[styles.indicatorDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={styles.indicatorNumber}>{osData.delayed}</Text>
                </View>
              </View>
              <Text style={styles.indicatorLabel}>Atrasadas</Text>
            </View>
            
            <View style={styles.indicatorItem}>
              <View style={styles.indicatorRow}>
                <View style={styles.leftContent}>
                  <View style={[styles.indicatorDot, { backgroundColor: '#94a3b8' }]} />
                  <Text style={styles.indicatorNumber}>{osData.pending}</Text>
                </View>
              </View>
              <Text style={styles.indicatorLabel}>Pendentes</Text>
            </View>
          </View>

          {/* Linha vertical separadora */}
          <View style={styles.verticalDivider} />

          {/* Gráfico de Colunas */}
          <View style={styles.columnChart}>
            <View style={styles.chartArea}>
              {/* Coluna das Atrasadas (menor %) */}
              <View style={styles.columnContainer}>
                <View style={styles.columnBackground}>
                  <View style={[
                    styles.columnBar,
                    {
                      backgroundColor: '#ef4444',
                      height: `${Math.max(percentages.delayed, 5)}%`,
                    }
                  ]} />
                </View>
                <Text style={styles.columnPercentage}>
                  {formatPercentage(percentages.delayed)}
                </Text>
              </View>
              
              {/* Coluna das Pendentes (meio %) */}
              <View style={styles.columnContainer}>
                <View style={styles.columnBackground}>
                  <View style={[
                    styles.columnBar,
                    {
                      backgroundColor: '#94a3b8',
                      height: `${Math.max(percentages.pending, 5)}%`,
                    }
                  ]} />
                </View>
                <Text style={styles.columnPercentage}>
                  {formatPercentage(percentages.pending)}
                </Text>
              </View>
              
              {/* Coluna das Executadas (maior %) */}
              <View style={styles.columnContainer}>
                <View style={styles.columnBackground}>
                  <View style={[
                    styles.columnBar,
                    {
                      backgroundColor: '#3b82f6',
                      height: `${Math.max(percentages.executed, 5)}%`,
                    }
                  ]} />
                </View>
                <Text style={styles.columnPercentage}>
                  {formatPercentage(percentages.executed)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    marginHorizontal: 20,
    marginTop: -15,
    marginBottom: 15,
  },
  userInfoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 10,
    marginBottom: 20,
  },
  userInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfoTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#1f2937',
    marginLeft: 8,
  },
  userStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  userStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIconContainer: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
    padding: 6,
    marginRight: 8,
  },
  userStatNumber: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#1f2937',
  },
  userStatLabel: {
    fontSize: RFValue(10),
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 14,
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
  },
  statsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartHeader: {
    marginBottom: 15,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#1f2937',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicators: {
    flex: 1,
    marginRight: 10,
  },
  indicatorItem: {
    marginBottom: 12,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    justifyContent: 'flex-start',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  indicatorNumber: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'left',
  },
  indicatorPercentage: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#6b7280',
    width: 35,
    textAlign: 'right',
  },
  indicatorLabel: {
    fontSize: RFValue(11),
    color: '#6b7280',
    fontWeight: '500',
    marginLeft: 18,
  },
  verticalDivider: {
    width: 1,
    height: 120,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 15,
  },
  columnChart: {
    width: 150,
    height: 140,
  },
  chartArea: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  columnContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  columnBackground: {
    width: 20,
    height: 100,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  columnBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  columnPercentage: {
    fontSize: RFValue(10),
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default ManagerStatsCard; 