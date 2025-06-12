import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Audit } from '../types/profile';

interface AuditCardProps {
  audit: Audit;
  onPress?: () => void;
}

const AuditCard: React.FC<AuditCardProps> = ({ audit, onPress }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'concluida':
        return '#10b981';
      case 'em_andamento':
        return '#f59e0b';
      case 'pendente':
        return '#6b7280';
      case 'cancelada':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'concluida':
        return 'Concluída';
      case 'em_andamento':
        return 'Em Andamento';
      case 'pendente':
        return 'Pendente';
      case 'cancelada':
        return 'Cancelada';
      default:
        return 'Status';
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.supabaseId}>#{audit.supabaseId}</Text>
        <View style={[
          styles.statusBadge,
          { backgroundColor: getStatusColor(audit.status) }
        ]}>
          <Text style={styles.statusText}>
            {getStatusLabel(audit.status)}
          </Text>
        </View>
      </View>
      
      <Text style={styles.title}>{audit.title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#38bdf8',
    borderRadius: 15,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  supabaseId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default AuditCard; 