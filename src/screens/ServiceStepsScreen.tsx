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
import { saveChecklistEtapaOffline, checkNetworkConnection } from '../services/offlineService';
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
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSteps, setIsLoadingSteps] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServiceSteps();
  }, []);

  // Função de back personalizada que considera se pulou a tela de início
  const handleBackPress = async () => {
    try {
      // Verificar se já existe foto inicial
      try {
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
      } catch (photoError) {
        console.error('💥 Erro ao verificar foto inicial:', photoError);
        // Em caso de erro, voltar normalmente
        onBackPress();
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao processar volta:', error);
      // Em caso de erro, voltar normalmente
      onBackPress();
    }
  };

  const loadServiceSteps = async () => {
    setIsLoadingSteps(true);
    try {
      setError(null);
      
      console.log('🔍 === INÍCIO DO CARREGAMENTO DE ETAPAS ===');
      console.log('📋 WorkOrder ID:', workOrder.id);
      console.log('📋 WorkOrder tipo_os_id:', workOrder.tipo_os_id);
      console.log('📋 WorkOrder title:', workOrder.title);
      
      // Garantir que temos um tipo_os_id válido
      const tipoOsId = workOrder.tipo_os_id || 1;
      console.log('📋 Usando tipo_os_id:', tipoOsId);
      
      // Verificar conectividade
      const NetInfo = require('@react-native-community/netinfo');
      const netInfo = await NetInfo.fetch();
      console.log(`📶 Status de conectividade: ${netInfo.isConnected ? 'ONLINE' : 'OFFLINE'}`);
      
      // MODO OFFLINE - APENAS CACHE LOCAL
      if (!netInfo.isConnected) {
        console.log('📱 MODO OFFLINE: Buscando apenas do cache local...');
        
        try {
          // USAR STORAGE ADAPTER ao invés do AsyncStorage direto
          const { default: storageAdapter } = await import('../services/storageAdapter');
          
          const stepsCache = await storageAdapter.getItem('cached_service_steps');
          const entriesCache = await storageAdapter.getItem('cached_service_entries');
          
          if (stepsCache) {
            const cache = JSON.parse(stepsCache);
            const steps = cache[tipoOsId];
            
            if (steps && steps.length > 0) {
              console.log(`📝 OFFLINE: ${steps.length} etapas encontradas no armazenamento híbrido`);
              
              // Buscar entradas se existirem
              let stepsWithData = steps;
              if (entriesCache) {
                const entriesData = JSON.parse(entriesCache);
                stepsWithData = steps.map((step: ServiceStep) => ({
                  ...step,
                  entradas: entriesData[step.id] || []
                }));
              }
              
              console.log('✅ OFFLINE: Dados carregados do armazenamento híbrido');
              setSteps(stepsWithData);
              return;
            }
          }
          
          console.log('❌ OFFLINE: Nenhum dado no cache - use o app online primeiro');
          setSteps([]);
          return;
          
        } catch (cacheError) {
          console.error('💥 Erro ao buscar cache offline:', cacheError);
          console.log('❌ OFFLINE: Falha no cache - dados não disponíveis');
          setSteps([]);
          return;
        }
      }
      
      // MODO ONLINE - Tentar servidor, fallback para cache
      console.log('🌐 MODO ONLINE: Tentando servidor primeiro...');
      try {
        // Primeiro tentar cache mesmo online
        const { getCachedServiceSteps, getCachedServiceEntries } = await import('../services/cacheService');
        const stepsResult = await getCachedServiceSteps(tipoOsId);
        
        if (stepsResult.data && stepsResult.data.length > 0) {
          const etapaIds = stepsResult.data.map(step => step.id);
          const entriesResult = await getCachedServiceEntries(etapaIds);
          
          const stepsWithData = stepsResult.data.map(step => ({
            ...step,
            entradas: entriesResult.data?.[step.id] || []
          }));
          
          console.log('✅ ONLINE: Dados carregados do cache');
          setSteps(stepsWithData);
          return;
        }
        
        // Se não tem cache, tentar servidor
        console.log('🌐 ONLINE: Cache vazio, tentando servidor...');
        const { data: stepsFromServer, error, fromCache } = await getServiceStepsWithDataCached(
          tipoOsId, 
          workOrder.id
        );
        
        if (stepsFromServer && stepsFromServer.length > 0) {
          console.log('✅ ONLINE: Etapas carregadas do servidor');
          setSteps(stepsFromServer);
          return;
        }
        
      } catch (serverError) {
        console.error('💥 Erro online:', serverError);
      }
      
      // Se chegou até aqui, não encontrou nada
      console.warn('⚠️ Nenhuma etapa encontrada após todas as tentativas');
      setSteps([]);
      
    } catch (error) {
      console.error('💥 Erro inesperado ao carregar etapas:', error);
      setSteps([]);
    } finally {
      setIsLoadingSteps(false);
      console.log('🔍 === FIM DO CARREGAMENTO DE ETAPAS ===');
    }
  };

  // Função para expandir/encolher etapas
  const toggleStepExpansion = (stepId: number) => {
    setExpandedSteps(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(stepId)) {
        newExpanded.delete(stepId);
      } else {
        newExpanded.add(stepId);
      }
      return newExpanded;
    });
  };

  const handleFinishService = async () => {
    try {
      // Verificar se já existe foto final
      try {
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
      } catch (photoError) {
        console.error('💥 Erro ao verificar foto final:', photoError);
        // Em caso de erro, continuar normalmente
        onFinishService();
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao finalizar serviço:', error);
      // Em caso de erro, continuar normalmente
      onFinishService();
    }
  };

  // Função para criar etapas específicas offline baseado no tipo de OS
  const createOfflineStepsForType = (tipoOsId: number, workOrder: WorkOrder): ServiceStep[] => {
    console.log(`🏗️ Criando etapas offline para tipo ${tipoOsId}, OS: ${workOrder.title}`);
    
    // Gerar IDs únicos baseados no tipo e WorkOrder ID para consistência
    const baseId = (tipoOsId * 1000) + (workOrder.id % 1000);
    
    // Diferentes tipos de OS têm etapas diferentes
    switch (tipoOsId) {
      case 1: // Instalação Residencial
        return [
          {
            id: baseId + 1,
            titulo: 'Frente da Residência',
            ordem_etapa: 1,
            etapa_os_id: baseId + 1,
            entradas: [
              {
                id: baseId + 11,
                etapa_os_id: baseId + 1,
                ordem_entrada: 1,
                titulo: 'Foto da fachada da residência',
                valor: '',
                completed: false
              },
              {
                id: baseId + 12,
                etapa_os_id: baseId + 1,
                ordem_entrada: 2,
                titulo: 'Número da casa visível',
                valor: '',
                completed: false
              }
            ]
          },
          {
            id: baseId + 2,
            titulo: 'Ponto de Instalação',
            ordem_etapa: 2,
            etapa_os_id: baseId + 2,
            entradas: [
              {
                id: baseId + 21,
                etapa_os_id: baseId + 2,
                ordem_entrada: 1,
                titulo: 'Local escolhido para instalação',
                valor: '',
                completed: false
              },
              {
                id: baseId + 22,
                etapa_os_id: baseId + 2,
                ordem_entrada: 2,
                titulo: 'Medições do ambiente',
                valor: '',
                completed: false
              }
            ]
          },
          {
            id: baseId + 3,
            titulo: 'Finalização',
            ordem_etapa: 3,
            etapa_os_id: baseId + 3,
            entradas: [
              {
                id: baseId + 31,
                etapa_os_id: baseId + 3,
                ordem_entrada: 1,
                titulo: 'Equipamento instalado',
                valor: '',
                completed: false
              },
              {
                id: baseId + 32,
                etapa_os_id: baseId + 3,
                ordem_entrada: 2,
                titulo: 'Teste de funcionamento',
                valor: '',
                completed: false
              }
            ]
          }
        ];
        
      case 2: // Instalação Comercial
        return [
          {
            id: baseId + 1,
            titulo: 'Fachada Comercial',
            ordem_etapa: 1,
            etapa_os_id: baseId + 1,
            entradas: [
              {
                id: baseId + 11,
                etapa_os_id: baseId + 1,
                ordem_entrada: 1,
                titulo: 'Foto da entrada principal',
                valor: '',
                completed: false
              },
              {
                id: baseId + 12,
                etapa_os_id: baseId + 1,
                ordem_entrada: 2,
                titulo: 'Identificação do estabelecimento',
                valor: '',
                completed: false
              }
            ]
          },
          {
            id: baseId + 2,
            titulo: 'Ambiente Interno',
            ordem_etapa: 2,
            etapa_os_id: baseId + 2,
            entradas: [
              {
                id: baseId + 21,
                etapa_os_id: baseId + 2,
                ordem_entrada: 1,
                titulo: 'Layout do ambiente',
                valor: '',
                completed: false
              },
              {
                id: baseId + 22,
                etapa_os_id: baseId + 2,
                ordem_entrada: 2,
                titulo: 'Pontos de rede existentes',
                valor: '',
                completed: false
              }
            ]
          },
          {
            id: baseId + 3,
            titulo: 'Configuração',
            ordem_etapa: 3,
            etapa_os_id: baseId + 3,
            entradas: [
              {
                id: baseId + 31,
                etapa_os_id: baseId + 3,
                ordem_entrada: 1,
                titulo: 'Equipamentos configurados',
                valor: '',
                completed: false
              }
            ]
          }
        ];
        
      default: // Tipo genérico/desconhecido
        return [
          {
            id: baseId + 1,
            titulo: 'Documentação Inicial',
            ordem_etapa: 1,
            etapa_os_id: baseId + 1,
            entradas: [
              {
                id: baseId + 11,
                etapa_os_id: baseId + 1,
                ordem_entrada: 1,
                titulo: 'Foto do local de atendimento',
                valor: '',
                completed: false
              },
              {
                id: baseId + 12,
                etapa_os_id: baseId + 1,
                ordem_entrada: 2,
                titulo: 'Condições do ambiente',
                valor: '',
                completed: false
              }
            ]
          },
          {
            id: baseId + 2,
            titulo: 'Execução do Serviço',
            ordem_etapa: 2,
            etapa_os_id: baseId + 2,
            entradas: [
              {
                id: baseId + 21,
                etapa_os_id: baseId + 2,
                ordem_entrada: 1,
                titulo: 'Serviço em andamento',
                valor: '',
                completed: false
              },
              {
                id: baseId + 22,
                etapa_os_id: baseId + 2,
                ordem_entrada: 2,
                titulo: 'Verificações realizadas',
                valor: '',
                completed: false
              }
            ]
          },
          {
            id: baseId + 3,
            titulo: 'Conclusão',
            ordem_etapa: 3,
            etapa_os_id: baseId + 3,
            entradas: [
              {
                id: baseId + 31,
                etapa_os_id: baseId + 3,
                ordem_entrada: 1,
                titulo: 'Serviço finalizado',
                valor: '',
                completed: false
              }
            ]
          }
        ];
    }
  };

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

  if (isLoadingSteps) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Carregando etapas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
                    <TouchableOpacity 
                      style={styles.stepHeader}
                      onPress={() => toggleStepExpansion(step.id)}
                    >
                      <View style={styles.stepHeaderTextContainer}>
                        <Text style={styles.stepHeaderText}>{step.titulo}</Text>
                        {step.entradas && step.entradas.length > 0 && (
                          <Text style={styles.stepHeaderCount}>
                            ({step.entradas.length} itens)
                          </Text>
                        )}
                      </View>
                      <Ionicons 
                        name={expandedSteps.has(step.id) ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color="#6b7280" 
                      />
                    </TouchableOpacity>

                    {/* Mostrar Entradas da Etapa apenas se expandida */}
                    {expandedSteps.has(step.id) && step.entradas && step.entradas.length > 0 ? (
                      <View style={styles.entriesContainer}>
                        {step.entradas.map((entrada, entryIndex) => (
                          <View 
                            key={entrada.id} 
                            style={styles.entryItem}
                          >
                            <View style={styles.entryBullet}>
                              <Text style={styles.entryBulletText}>•</Text>
                            </View>
                            <View style={styles.entryTextContainer}>
                              <Text style={styles.entryText}>
                                {entrada.titulo || entrada.valor || 'Item sem título'}
                              </Text>
                              {entrada.foto_base64 && (
                                <Text style={styles.entryPhotoIndicator}>
                                  📷 Foto anexada
                                </Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : expandedSteps.has(step.id) && (!step.entradas || step.entradas.length === 0) ? (
                      <View style={styles.noEntriesContainer}>
                        <Text style={styles.noEntriesText}>
                          Nenhum item encontrado para esta etapa
                        </Text>
                      </View>
                    ) : null}
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
            Encerrar ordem de serviço
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
    paddingVertical: 8,
    paddingHorizontal: 4,
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
    marginLeft: 16,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  entryBulletText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#6b7280',
  },
  entryTextContainer: {
    flex: 1,
  },
  entryText: {
    fontSize: RFValue(12),
    color: '#374151',
    marginBottom: 2,
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