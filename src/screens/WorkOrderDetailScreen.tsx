import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';

interface WorkOrderDetailScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onStartService: () => void;
  onDownloadReport?: () => void;
  onEvaluateOrder?: () => void;
  onReopenOrder?: () => void;
}

const { width } = Dimensions.get('window');

const WorkOrderDetailScreen: React.FC<WorkOrderDetailScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onStartService,
  onDownloadReport,
  onEvaluateOrder,
  onReopenOrder,
}) => {
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visualização da Ordem de Serviço</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Card Principal */}
        <View style={styles.mainCard}>
          {/* Badge de Status e ID */}
          <View style={styles.cardHeader}>
            <Text style={styles.orderNumber}>{String(workOrder.id).padStart(2, '0')}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(workOrder.status) }]}>
              <Text style={styles.statusText}>{getStatusText(workOrder.status)}</Text>
            </View>
          </View>

          {/* Título */}
          <Text style={styles.title}>{workOrder.title}</Text>

          {/* Informações dinâmicas - apenas para OSs finalizadas e gestores */}
          {workOrder.status === 'finalizada' && user.userType === 'gestor' && (
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="people" size={16} color="#666" />
                <Text style={styles.infoLabel}>Técnicos</Text>
                <View style={styles.tecnicosContainer}>
                  <Text style={styles.infoValue}>{workOrder.tecnico_principal || 'Robert'}</Text>
                  <Text style={styles.infoValue}>{workOrder.tecnico_auxiliar || 'Jacob'}</Text>
                </View>
              </View>
              
              <View style={styles.infoItem}>
                <Ionicons name="time" size={16} color="#666" />
                <Text style={styles.infoLabel}>Execução</Text>
                <Text style={styles.infoValue}>{workOrder.tempo_execucao || '40min'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Informações Úteis - sem background */}
        <View style={styles.clientInfoSection}>
          <Text style={styles.sectionTitle}>Informações úteis</Text>
          
          <View style={styles.infoDetailRow}>
            <Ionicons name="location" size={18} color="#666" />
            <View style={styles.infoDetailContent}>
              <Text style={styles.infoDetailLabel}>Endereço:</Text>
              <Text style={styles.infoDetailValue}>{workOrder.address}</Text>
            </View>
          </View>

          <View style={styles.infoDetailRow}>
            <Ionicons name="person" size={18} color="#666" />
            <View style={styles.infoDetailContent}>
              <Text style={styles.infoDetailLabel}>Nome do Cliente:</Text>
              <Text style={styles.infoDetailValue}>{workOrder.client}</Text>
            </View>
          </View>

          {/* Descrição do Serviço */}
          <Text style={styles.description}>
            {workOrder.os_conteudo || 'Descrição da atividade não disponível.'}
          </Text>
        </View>

        {/* Botões de ação para OSs finalizadas - apenas para gestores */}
        {workOrder.status === 'finalizada' && user.userType === 'gestor' && (
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.downloadButton]} 
              onPress={onDownloadReport}
            >
              <Text style={[styles.actionButtonText, styles.downloadButtonText]}>Baixar relatório</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.evaluateButton]} 
              onPress={onEvaluateOrder}
            >
              <Text style={styles.actionButtonText}>Avaliar ordem de serviço</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.reopenButton]} 
              onPress={onReopenOrder}
            >
              <Text style={styles.actionButtonText}>Reabrir ordem de serviço</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Botão de Iniciar - apenas para técnicos */}
        {user.userType === 'tecnico' && (
          <TouchableOpacity style={styles.startButton} onPress={onStartService}>
            <Text style={styles.startButtonText}>
              {workOrder.status === 'em_progresso' ? 'Continuar Ordem de Serviço' : 'Iniciar Ordem de Serviço'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Espaço para o bottom navigation */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigationContainer}>
        <BottomNavigation 
          activeTab="home" 
          onTabPress={onTabPress}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    color: 'white',
    fontSize: RFValue(18),
    fontWeight: '600',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  orderNumber: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    fontSize: RFValue(12),
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: RFValue(11),
    fontWeight: '500',
  },
  title: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 20,
    lineHeight: 22,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    gap: 12,
  },
  infoItem: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  infoLabel: {
    fontSize: RFValue(11),
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  infoValue: {
    fontSize: RFValue(12),
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    lineHeight: 16,
  },
  clientInfoSection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  infoDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoDetailContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoDetailLabel: {
    fontSize: RFValue(13),
    color: '#1f2937',
    fontWeight: '500',
  },
  infoDetailValue: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginTop: 2,
  },
  description: {
    fontSize: RFValue(13),
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 8,
  },
  startButton: {
    backgroundColor: '#E0ED54',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  startButtonText: {
    color: '#1f2937',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomNavigationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  actionButtonsContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  downloadButton: {
    backgroundColor: '#E0ED54',
  },
  evaluateButton: {
    backgroundColor: '#3b82f6',
  },
  reopenButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: 'white',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
  downloadButtonText: {
    color: '#1f2937',
  },
  sectionTitle: {
    fontSize: RFValue(18),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  tecnicosContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
});

export default WorkOrderDetailScreen; 