import React from 'react';
import { 
  View, 
  Text, 
  Modal, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions,
  TouchableWithoutFeedback,
  StatusBar
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { WorkOrder } from '../types/workOrder';

interface WorkOrderModalProps {
  visible: boolean;
  workOrder: WorkOrder | null;
  onClose: () => void;
  onConfirm: () => void;
}

const { width, height } = Dimensions.get('window');

const WorkOrderModal: React.FC<WorkOrderModalProps> = ({
  visible,
  workOrder,
  onClose,
  onConfirm
}) => {
  if (!workOrder) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.5)" />
      
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <BlurView intensity={20} style={styles.blurOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContainer}>
                <View style={styles.modal}>
                  {/* Cabeçalho */}
                  <View style={styles.header}>
                    <View style={styles.headerContent}>
                      <Ionicons name="document-text" size={24} color="#3b82f6" />
                      <Text style={styles.headerTitle}>Ordem de Serviço</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                      <Ionicons name="close" size={24} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  {/* Conteúdo */}
                  <View style={styles.content}>
                    <Text style={styles.question}>
                      Abrir OS #{workOrder.id} - {workOrder.title}?
                    </Text>
                    
                    <View style={styles.infoContainer}>
                      <View style={styles.infoRow}>
                        <Ionicons name="person-outline" size={16} color="#6b7280" />
                        <Text style={styles.infoLabel}>Cliente:</Text>
                        <Text style={styles.infoValue}>{workOrder.client}</Text>
                      </View>
                      
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={16} color="#6b7280" />
                        <Text style={styles.infoLabel}>Endereço:</Text>
                        <Text style={styles.infoValue}>{workOrder.address}</Text>
                      </View>
                      
                      <View style={styles.infoRow}>
                        <Ionicons name="time-outline" size={16} color="#6b7280" />
                        <Text style={styles.infoLabel}>Status:</Text>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(workOrder.status) }]}>
                          <Text style={styles.statusText}>{getStatusText(workOrder.status)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Botões */}
                  <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                      <Text style={styles.confirmButtonText}>Abrir</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </BlurView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'aguardando':
      return '#AFAFAF';
    case 'em_progresso':
      return '#f4a133';
    case 'finalizada':
      return '#60c0f4';
    case 'cancelada':
      return '#ef4444';
    default:
      return '#6b7280';
  }
};

const getStatusText = (status: string): string => {
  switch (status) {
    case 'aguardando':
      return 'Aguardando';
    case 'em_progresso':
      return 'Em Progresso';
    case 'finalizada':
      return 'Finalizada';
    case 'cancelada':
      return 'Cancelada';
    default:
      return status;
  }
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  blurOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.9,
    maxWidth: 400,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: RFValue(18),
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 10,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  question: {
    fontSize: RFValue(16),
    fontWeight: '500',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  infoContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 15,
    marginBottom: 5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: RFValue(14),
    color: '#6b7280',
    marginLeft: 8,
    marginRight: 6,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: RFValue(14),
    color: '#1f2937',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  statusText: {
    fontSize: RFValue(12),
    fontWeight: '600',
    color: 'white',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#6b7280',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: 'white',
  },
});

export default WorkOrderModal; 