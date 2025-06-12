import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { UserStats } from '../types/profile';

interface StatsCardProps {
  stats: UserStats;
}

const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  return (
    <View style={styles.container}>
      <View style={styles.statItem}>
        <Text style={styles.statLabel}>OS Realizadas</Text>
        <Text style={styles.statValue}>total</Text>
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
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: RFValue(14),
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  statValue: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#374151',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 20,
  },
  rankingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankingValue: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#374151',
    marginLeft: 5,
  },
});

export default StatsCard; 