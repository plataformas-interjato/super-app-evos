import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { WorkOrder } from '../types/workOrder';

interface OSCardProps {
  workOrder: WorkOrder;
  onPress?: () => void;
  onDownload?: () => void;
  showDate?: boolean;
}

const OSCard: React.FC<OSCardProps> = ({ workOrder, onPress, onDownload, showDate = true }) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <View>
      {/* Data com linha ao lado */}
      {showDate && (
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={16} color="#6b7280" />
          <Text style={styles.dateText}>{formatDate(workOrder.updatedAt)}</Text>
          <View style={styles.dateLine} />
        </View>
      )}
      
      {/* Card da OS */}
      <TouchableOpacity style={styles.container} onPress={onPress}>
        <View style={styles.header}>
          <View style={styles.osNumberContainer}>
            <Text style={styles.osNumber}>{workOrder.id}</Text>
          </View>
          
          <View style={styles.contentContainer}>
            <View style={styles.titleRow}>
              <Ionicons name="build-outline" size={16} color="#1f2937" />
              <Text style={styles.title} numberOfLines={2}>
                {workOrder.title}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Botão de download */}
        <TouchableOpacity 
          style={styles.downloadButton} 
          onPress={onDownload}
        >
          <Text style={styles.downloadText}>Clique para baixar</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 15,
    marginTop: 15,
    marginBottom: 8,
  },
  dateText: {
    fontSize: RFValue(12),
    color: '#6b7280',
    marginLeft: 5,
    marginRight: 10,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#d1d5db',
  },
  container: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: '#AFAFAF',
  },
  header: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  osNumberContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 12,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  osNumber: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#1f2937',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#1f2937',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
  downloadButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  downloadText: {
    fontSize: RFValue(12),
    color: '#3b82f6',
    fontWeight: '500',
  },
});

export default OSCard; 