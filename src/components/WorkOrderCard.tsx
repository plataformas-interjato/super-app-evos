import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { WorkOrder } from '../types/workOrder';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  onPress?: () => void;
  onRefresh?: () => void;
}

const WorkOrderCard: React.FC<WorkOrderCardProps> = ({ 
  workOrder, 
  onPress, 
  onRefresh 
}) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'alta':
        return '#ef4444';
      case 'media':
        return '#f59e0b';
      case 'baixa':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'alta':
        return 'Prioridade';
      case 'media':
        return 'Normal';
      case 'baixa':
        return 'Baixa';
      default:
        return 'Normal';
    }
  };

  // Verifica se a OS está encerrada (finalizada ou cancelada)
  const isFinished = workOrder.status === 'finalizada' || workOrder.status === 'cancelada';

  const handlePress = () => {
    // Não executa a ação de clique se a OS estiver encerrada
    if (isFinished || !onPress) {
      return;
    }
    onPress();
  };

  return (
    <TouchableOpacity 
      style={[
        styles.container,
        isFinished && styles.disabledContainer
      ]} 
      onPress={handlePress}
      activeOpacity={isFinished ? 1 : 0.7}
      disabled={isFinished}
    >
      <View style={styles.header}>
        <Text style={[
          styles.id,
          isFinished && styles.disabledText
        ]}>
          #{workOrder.id}
        </Text>
        <View style={[
          styles.priorityBadge,
          { backgroundColor: getPriorityColor(workOrder.priority) },
          isFinished && styles.disabledBadge
        ]}>
          <Text style={styles.priorityText}>
            {getPriorityLabel(workOrder.priority)}
          </Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <Ionicons 
          name="build" 
          size={RFValue(16)} 
          color={isFinished ? "#9ca3af" : "#000000"} 
        />
        <Text style={[
          styles.infoText,
          isFinished && styles.disabledText
        ]}>
          {workOrder.title}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Ionicons 
          name="person" 
          size={RFValue(16)} 
          color={isFinished ? "#9ca3af" : "#000000"} 
        />
        <Text style={[
          styles.infoText,
          isFinished && styles.disabledText
        ]}>
          {workOrder.client}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Ionicons 
          name="location" 
          size={RFValue(16)} 
          color={isFinished ? "#9ca3af" : "#000000"} 
        />
        <Text style={[
          styles.infoText,
          isFinished && styles.disabledText
        ]}>
          {workOrder.address}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[
            styles.refreshButton,
            isFinished && styles.disabledButton
          ]} 
          onPress={onRefresh}
          disabled={isFinished}
        >
          <Ionicons 
            name="refresh" 
            size={RFValue(20)} 
            color={isFinished ? "#9ca3af" : "#000000"} 
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  disabledContainer: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  id: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#000000',
  },
  disabledText: {
    color: '#9ca3af',
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  disabledBadge: {
    opacity: 0.5,
  },
  priorityText: {
    color: 'white',
    fontSize: RFValue(12),
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: RFValue(14),
    color: '#000000',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  refreshButton: {
    padding: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default WorkOrderCard; 