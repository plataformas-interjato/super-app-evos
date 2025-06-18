import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';

interface UserStats {
  totalCompletedOS: number;
  ranking: number;
}

interface UserStatsCardProps {
  stats: UserStats;
}

const UserStatsCard: React.FC<UserStatsCardProps> = ({ stats }) => {
  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>Informações do usuário</Text>
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>OS realizadas</Text>
            <Text style={styles.statValue}>{stats.totalCompletedOS}</Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Ranqueamento</Text>
            <View style={styles.rankingContainer}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.rankingValue}>{stats.ranking.toFixed(1)}</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications-outline" size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 15,
    shadowColor: 'transparent',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  infoContainer: {
    padding: 0,
  },
  infoTitle: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: RFValue(14),
    color: '#6b7280',
    marginBottom: 5,
  },
  statValue: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#374151',
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
  notificationButton: {
    padding: 10,
    borderRadius: 25,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default UserStatsCard; 