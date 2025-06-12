import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { ManagerStats } from '../types/manager';

interface ManagerStatsCardProps {
  stats: ManagerStats;
}

const ManagerStatsCard: React.FC<ManagerStatsCardProps> = ({ stats }) => {
  return (
    <View style={styles.container}>
      {/* Header com estatísticas principais */}
      <View style={styles.headerStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>OS Avaliadas</Text>
          <Text style={styles.statValue}>Total</Text>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Ranqueamento</Text>
          <View style={styles.rankingContainer}>
            <Ionicons name="star" size={16} color="#f59e0b" />
            <Text style={styles.rankingValue}>{stats.ranking.toFixed(1)}</Text>
          </View>
        </View>
      </View>

      {/* Seção de Ordens de Serviço Gerais */}
      <View style={styles.generalSection}>
        <Text style={styles.sectionTitle}>Ordens de Serviço - Gerais</Text>
        
        <View style={styles.chartContainer}>
          {/* Indicadores laterais */}
          <View style={styles.indicators}>
            <View style={styles.indicatorItem}>
              <View style={[styles.indicatorDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.indicatorText}>{stats.executed.count}</Text>
              <Text style={styles.indicatorLabel}>Executadas</Text>
            </View>
            
            <View style={styles.indicatorItem}>
              <View style={[styles.indicatorDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.indicatorText}>{stats.delayed.count}</Text>
              <Text style={styles.indicatorLabel}>Atrasadas</Text>
            </View>
            
            <View style={styles.indicatorItem}>
              <View style={[styles.indicatorDot, { backgroundColor: '#6b7280' }]} />
              <Text style={styles.indicatorText}>{stats.pending.count}</Text>
              <Text style={styles.indicatorLabel}>Pendentes</Text>
            </View>
          </View>

          {/* Gráfico de Pizza (Simulado) */}
          <View style={styles.pieChart}>
            <View style={styles.pieContainer}>
              {/* Segmento Executadas - 39% */}
              <View style={[styles.pieSegment, styles.executedSegment]} />
              {/* Segmento Atrasadas - 41% */}
              <View style={[styles.pieSegment, styles.delayedSegment]} />
              {/* Segmento Pendentes - 20% */}
              <View style={[styles.pieSegment, styles.pendingSegment]} />
              
              {/* Labels de porcentagem */}
              <Text style={[styles.percentageLabel, styles.executedLabel]}>39%</Text>
              <Text style={[styles.percentageLabel, styles.delayedLabel]}>41%</Text>
              <Text style={[styles.percentageLabel, styles.pendingLabel]}>20%</Text>
            </View>
          </View>
        </View>

        <Text style={styles.lastUpdate}>Última atualização: {stats.lastUpdate}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 15,
  },
  headerStats: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: RFValue(14),
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  statValue: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: 'white',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 20,
  },
  rankingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankingValue: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 5,
  },
  generalSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 20,
  },
  sectionTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  indicators: {
    flex: 1,
    marginRight: 20,
  },
  indicatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  indicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  indicatorText: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: 'white',
    minWidth: 20,
    marginRight: 8,
  },
  indicatorLabel: {
    fontSize: RFValue(14),
    color: 'rgba(255, 255, 255, 0.8)',
  },
  pieChart: {
    width: 120,
    height: 120,
  },
  pieContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: 'relative',
    backgroundColor: '#6b7280',
    overflow: 'hidden',
  },
  pieSegment: {
    position: 'absolute',
    width: 120,
    height: 120,
  },
  executedSegment: {
    backgroundColor: '#3b82f6',
    transform: [{ rotate: '0deg' }],
    borderTopRightRadius: 60,
    borderBottomRightRadius: 60,
    right: 60,
    width: 60,
  },
  delayedSegment: {
    backgroundColor: '#ef4444',
    transform: [{ rotate: '140deg' }],
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    top: 0,
    height: 60,
  },
  pendingSegment: {
    backgroundColor: '#6b7280',
  },
  percentageLabel: {
    position: 'absolute',
    fontSize: RFValue(14),
    fontWeight: 'bold',
    color: 'white',
  },
  executedLabel: {
    bottom: 20,
    right: 25,
  },
  delayedLabel: {
    top: 15,
    left: 25,
  },
  pendingLabel: {
    top: 45,
    right: 25,
  },
  lastUpdate: {
    fontSize: RFValue(12),
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
});

export default ManagerStatsCard; 