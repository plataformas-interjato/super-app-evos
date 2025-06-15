import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';
import { hasFinalPhoto, hasInitialPhoto } from '../services/auditService';
import { 
  ServiceStep, 
  ServiceStepData, 
  getServiceStepsWithDataCached,
  saveServiceStepData,
  testDatabaseData,
  insertTestData,
  updateWorkOrderWithTestType,
  debugDatabaseStructure,
  getServiceStepsByTypeIdTest,
  getAllStepsForDebug
} from '../services/serviceStepsService';

interface ServiceStepsScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onFinishService: () => void;
  onBackToWorkOrderDetail?: () => void;
  onSkipToPhotoCollection?: () => void;
}

const ServiceStepsScreen: React.FC<ServiceStepsScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onFinishService,
  onBackToWorkOrderDetail,
  onSkipToPhotoCollection,
}) => {
  const [steps, setSteps] = useState<ServiceStep[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSteps, setIsLoadingSteps] = useState(true);

  useEffect(() => {
    loadServiceSteps();
    loadCompletedStepsFromStorage();
  }, []);

  // Função de back personalizada que considera se pulou a tela de início
  const handleBackPress = async () => {
    try {
      // Verificar se já existe foto inicial
      const { hasPhoto, error } = await hasInitialPhoto(workOrder.id);
      
      if (error) {
        console.warn('⚠️ Erro ao verificar foto inicial, voltando normalmente:', error);
        // Em caso de erro, voltar normalmente
        onBackPress();
        return;
      }

      if (hasPhoto && onBackToWorkOrderDetail) {
        console.log('✅ Foto inicial existe, voltando para detalhes da OS');
        // Se tem foto inicial e a função foi fornecida, voltar para detalhes da OS
        onBackToWorkOrderDetail();
      } else {
        console.log('📱 Sem foto inicial ou função não fornecida, voltando normalmente');
        // Se não tem foto inicial ou função não foi fornecida, voltar normalmente
        onBackPress();
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao verificar foto inicial:', error);
      // Em caso de erro, voltar normalmente
      onBackPress();
    }
  };

  const loadServiceSteps = async () => {
    setIsLoadingSteps(true);
    try {
      // Se não tem tipo_os_id, tentar atualizar a OS
      if (!workOrder.tipo_os_id) {
        await updateWorkOrderWithTestType(workOrder.id);
        // Recarregar a WorkOrder seria ideal, mas por enquanto vamos usar um valor padrão
        workOrder.tipo_os_id = 1; // Assumir que foi criado com ID 1
      }
      
      // Usar a nova função com cache que funciona offline
      if (workOrder.tipo_os_id) {
        const { data: stepsFromCache, error, fromCache } = await getServiceStepsWithDataCached(
          workOrder.tipo_os_id, 
          workOrder.id
        );
        
        if (stepsFromCache && !error && stepsFromCache.length > 0) {
          setSteps(stepsFromCache);
          
          // Mostrar indicador se dados vieram do cache
          if (fromCache) {
            console.log('📱 Dados carregados do cache local');
          } else {
            console.log('🌐 Dados carregados do servidor');
          }
          return;
        } else {
          console.warn('⚠️ Nenhuma etapa encontrada:', error);
          setSteps([]);
          return;
        }
      } else {
        console.warn('⚠️ Nenhum tipo_os_id disponível');
        setSteps([]);
        return;
      }
    } catch (error) {
      console.error('💥 Erro ao carregar etapas:', error);
      // Em caso de erro, não mostrar alert se estivermos offline
      const NetInfo = require('@react-native-community/netinfo');
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.isConnected) {
        Alert.alert('Erro', 'Não foi possível carregar as etapas do serviço.');
      } else {
        console.log('📱 Offline: erro esperado, continuando sem dados');
      }
      setSteps([]);
    } finally {
      setIsLoadingSteps(false);
    }
  };

  const toggleEntryCompletion = async (entryId: number) => {
    const isCompleted = completedSteps.has(entryId);
    
    let newCompletedSteps: Set<number>;
    
    if (!isCompleted) {
      // Marcar como completo
      newCompletedSteps = new Set([...completedSteps, entryId]);
    } else {
      // Desmarcar
      newCompletedSteps = new Set(completedSteps);
      newCompletedSteps.delete(entryId);
    }
    
    setCompletedSteps(newCompletedSteps);
    
    // Salvar no localStorage
    await saveCompletedStepsToStorage(newCompletedSteps);
  };

  const handleFinishService = async () => {
    try {
      // Verificar se já existe foto final
      const { hasPhoto, error } = await hasFinalPhoto(workOrder.id);
      
      if (error) {
        console.warn('⚠️ Erro ao verificar foto final, continuando normalmente:', error);
        // Em caso de erro, continuar normalmente para auditoria
        onFinishService();
        return;
      }

      if (hasPhoto && onSkipToPhotoCollection) {
        console.log('✅ Foto final já existe, pulando direto para coleta de fotos');
        // Se já tem foto final, pular direto para coleta de fotos
        onSkipToPhotoCollection();
      } else {
        console.log('📱 Sem foto final, indo para auditoria normalmente');
        // Se não tem foto final, ir para auditoria normalmente
        onFinishService();
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao verificar foto final:', error);
      // Em caso de erro, continuar normalmente
      onFinishService();
    }
  };

  const getCompletionStats = () => {
    // Contar o total de entradas em todas as etapas
    const totalEntries = steps.reduce((total, step) => {
      return total + (step.entradas?.length || 0);
    }, 0);
    
    const completedCount = completedSteps.size;
    const percentage = totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;
    
    return { totalSteps: totalEntries, completedCount, percentage };
  };

  const { totalSteps, completedCount, percentage } = getCompletionStats();

  const getStatusText = (status: string) => {
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'aguardando':
        return styles.statusAguardando;
      case 'em_progresso':
        return styles.statusEmProgresso;
      case 'finalizada':
        return styles.statusFinalizada;
      case 'cancelada':
        return styles.statusCancelada;
      default:
        return {};
    }
  };

  // Função para salvar checks no localStorage
  const saveCompletedStepsToStorage = async (completedIds: Set<number>) => {
    try {
      const key = `completed_steps_${workOrder.id}`;
      const completedArray = Array.from(completedIds);
      await AsyncStorage.setItem(key, JSON.stringify(completedArray));
    } catch (error) {
      console.error('Erro ao salvar checks no localStorage:', error);
    }
  };

  // Função para carregar checks do localStorage
  const loadCompletedStepsFromStorage = async () => {
    try {
      const key = `completed_steps_${workOrder.id}`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const completedArray = JSON.parse(stored);
        setCompletedSteps(new Set(completedArray));
      }
    } catch (error) {
      console.error('Erro ao carregar checks do localStorage:', error);
    }
  };

  if (isLoadingSteps) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Carregando etapas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visualização da Ordem de Serviço</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Card Principal */}
        <View style={styles.mainCard}>
          {/* Header com ID e Status */}
          <View style={styles.cardHeader}>
            <Text style={styles.osId}>{workOrder.id}</Text>
            <View style={[styles.statusBadge, getStatusStyle(workOrder.status)]}>
              <Text style={[styles.statusText, getStatusStyle(workOrder.status)]}>
                {getStatusText(workOrder.status)}
              </Text>
            </View>
          </View>
          
          <Text style={styles.serviceTitle}>{workOrder.title}</Text>

          {/* Progresso */}
          {totalSteps > 0 && (
            <View style={styles.progressSection}>
              <Text style={styles.progressText}>
                Progresso: {completedCount}/{totalSteps} ({percentage}%)
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${percentage}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* Informações Úteis */}
        <View style={styles.section}>
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
        </View>

        {/* Fotos para Vistoria */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="camera" size={20} color="#666" />
            <Text style={styles.sectionTitle}>Fotos para vistoria</Text>
          </View>
          
          {steps.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateTitle}>Nenhuma etapa encontrada</Text>
              <Text style={styles.emptyStateText}>
                Não foram encontradas etapas para este tipo de ordem de serviço no banco de dados.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionSubtitle}>
                Documente as etapas do serviço com fotos para garantir a qualidade e rastreabilidade do trabalho realizado.
              </Text>
              
              <View style={styles.stepsList}>
                {steps.map((step, index) => (
                  <View key={step.id} style={styles.stepGroup}>
                    {/* Cabeçalho da Etapa */}
                    <View style={styles.stepHeader}>
                      <View style={styles.stepHeaderTextContainer}>
                        <Text style={styles.stepHeaderText}>{step.titulo}</Text>
                        {step.entradas && step.entradas.length > 0 && (
                          <Text style={styles.stepHeaderCount}>
                            ({step.entradas.length} itens)
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Mostrar Entradas da Etapa como itens clicáveis */}
                    {step.entradas && step.entradas.length > 0 ? (
                      <View style={styles.entriesContainer}>
                        {step.entradas.map((entrada, entryIndex) => (
                          <TouchableOpacity 
                            key={entrada.id} 
                            style={styles.entryItem}
                            onPress={() => toggleEntryCompletion(entrada.id)}
                          >
                            <View style={[
                              styles.entryBullet,
                              completedSteps.has(entrada.id) && styles.entryBulletCompleted
                            ]}>
                              {completedSteps.has(entrada.id) ? (
                                <Ionicons name="checkmark" size={12} color="white" />
                              ) : null}
                            </View>
                            <View style={styles.entryTextContainer}>
                              <Text style={[
                                styles.entryText,
                                completedSteps.has(entrada.id) && styles.entryTextCompleted
                              ]}>
                                {entrada.valor || 'Item sem título'}
                              </Text>
                              {entrada.foto_base64 && (
                                <Text style={styles.entryPhotoIndicator}>
                                  📷 Foto anexada
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.noEntriesContainer}>
                        <Text style={styles.noEntriesText}>
                          Nenhum item encontrado para esta etapa
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Botão de Encerrar */}
        <TouchableOpacity 
          style={[styles.finishButton, isLoading && styles.finishButtonDisabled]} 
          onPress={handleFinishService}
          disabled={isLoading}
        >
          <Text style={styles.finishButtonText}>
            Prosseguir para auditoria
          </Text>
        </TouchableOpacity>

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
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    fontSize: RFValue(18),
    fontWeight: '600',
    color: 'white',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mainCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  osId: {
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: RFValue(12),
    fontWeight: '600',
    color: '#1f2937',
  },
  serviceTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
  },
  infoDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  infoDetailContent: {
    flex: 1,
  },
  infoDetailLabel: {
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 2,
  },
  infoDetailValue: {
    fontSize: RFValue(14),
    color: '#1f2937',
    lineHeight: 20,
  },
  stepsList: {
    gap: 12,
  },
  stepGroup: {
    marginBottom: 8,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepHeaderTextContainer: {
    flex: 1,
  },
  stepHeaderText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#1f2937',
  },
  stepHeaderCount: {
    fontSize: RFValue(12),
    fontWeight: '500',
    color: '#6b7280',
  },
  entriesContainer: {
    marginLeft: 32,
    marginTop: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#e5e7eb',
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  entryBullet: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  entryBulletCompleted: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  entryTextContainer: {
    flex: 1,
  },
  entryText: {
    fontSize: RFValue(12),
    color: '#374151',
    marginBottom: 2,
  },
  entryTextCompleted: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  entryPhotoIndicator: {
    fontSize: RFValue(12),
    color: '#6b7280',
  },
  finishButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 24,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  finishButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0.1,
  },
  finishButtonText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: 'white',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: RFValue(16),
    color: '#6b7280',
  },
  progressSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  progressText: {
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  sectionSubtitle: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: RFValue(14),
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  noEntriesContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noEntriesText: {
    fontSize: RFValue(14),
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  statusAguardando: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  statusEmProgresso: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  statusFinalizada: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  statusCancelada: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
});

export default ServiceStepsScreen; 