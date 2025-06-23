import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  TextInput,
  ImageBackground,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';

import { User, WorkOrder, FilterStatus } from '../types/workOrder';
import { ManagerStats } from '../types/manager';
import BottomNavigation from '../components/BottomNavigation';
import Header from '../components/Header';
import SyncStatusIndicator from '../components/SyncStatusIndicator';
import ManagerStatsCard from '../components/ManagerStatsCard';
import { fetchWorkOrders } from '../services/workOrderService';
import { getLocalWorkOrderStatuses } from '../services/localStatusService';
import { getWorkOrdersWithCache, filterCachedWorkOrders, clearWorkOrdersCache, cacheWorkOrders } from '../services/workOrderCacheService';
import { supabase } from '../services/supabase';

interface ManagerScreenProps {
  user: User;
  onTabPress?: (tab: 'home' | 'profile') => void;
  onOpenWorkOrder?: (workOrder: WorkOrder) => void;
}

const ManagerScreen: React.FC<ManagerScreenProps> = ({ user, onTabPress, onOpenWorkOrder }) => {
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('todas');
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [realStats, setRealStats] = useState({
    totalFinalized: 0,
    totalAudited: 0,
    osStats: {
      executed: 0, // Todas OS finalizadas
      delayed: 0,  // OS finalizadas há mais de 1 dia sem avaliação
      pending: 0,  // OS pendentes de avaliação
    },
  });
  const [managerStats, setManagerStats] = useState<ManagerStats>({
    totalEvaluated: 0,
    ranking: 4.8,
    executed: { count: 136, percentage: 87.2 },
    delayed: { count: 8, percentage: 5.1 },
    pending: { count: 12, percentage: 7.7 },
    lastUpdate: new Date().toISOString(),
  });

  // Flags de controle para prevenir loops infinitos
  const [isLoadingWorkOrders, setIsLoadingWorkOrders] = useState(false);

  useEffect(() => {
    loadWorkOrders();
    loadManagerStats();
    loadRealStats();
    
    // Monitor de conectividade
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected || false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Recarregar quando filtros ou busca mudarem
  useEffect(() => {
    loadWorkOrders();
  }, [activeFilter, searchText]);

  const loadWorkOrders = async () => {
    // Proteção contra execuções simultâneas
    if (isLoadingWorkOrders) {
      console.log('⚠️ loadWorkOrders já em execução, ignorando nova chamada');
      return;
    }

    try {
      setIsLoadingWorkOrders(true);
      setError(null);
      
      console.log('🔍 Carregando todas as ordens de serviço para o gestor...');
      console.log('📋 Filtro ativo:', activeFilter);
      console.log('🔎 Busca:', searchText);
      
      // Verificar conectividade antes de fazer a requisição
      const netInfo = await NetInfo.fetch();
      console.log('📶 Status de conectividade:', netInfo.isConnected ? 'Online' : 'Offline');
      
      let data, fetchError, fromCache;
      
      if (netInfo.isConnected) {
        console.log('🌐 ONLINE: Buscando dados frescos para garantir status atualizados');
        
        // Limpar cache primeiro para garantir dados frescos
        const { clearWorkOrdersCache } = require('../services/workOrderCacheService');
        await clearWorkOrdersCache(); // Sem userId para buscar todas as OS
        
        // Buscar diretamente do servidor - TODAS as OS para o gestor
        const freshResult = await fetchWorkOrders(); // Busca todas as OS, não apenas de um técnico
        
        data = freshResult.data;
        fetchError = freshResult.error;
        fromCache = false;
        
        // Fazer cache dos dados frescos
        if (data && !fetchError) {
          const { cacheWorkOrders } = require('../services/workOrderCacheService');
          await cacheWorkOrders(data); // Sem userId para cache global
          
          // Aplicar filtros
          data = filterCachedWorkOrders(
            data,
            activeFilter,
            searchText.trim() || undefined
          );
        }
      } else {
        // OFFLINE: Usar cache como antes
        console.log('📱 OFFLINE: Usando sistema de cache');
        const result = await getWorkOrdersWithCache(
          () => fetchWorkOrders(), // Busca todas as OS
          undefined, // Sem userId para o gestor
          activeFilter,
          searchText.trim() || undefined
        );
        
        data = result.data;
        fetchError = result.error;
        fromCache = result.fromCache;
      }
      
      console.log(`✅ ${data?.length || 0} ordens de serviço carregadas${fromCache ? ' (cache)' : ' (servidor)'}`);
      
      if (fetchError) {
        console.error('❌ Erro ao carregar ordens de serviço:', fetchError);
        setError(fetchError);
        setWorkOrders([]);
      } else {
        // Aplicar status locais aos dados (se houver)
        const workOrdersWithLocal = await mergeLocalStatus(data || []);
        setWorkOrders(workOrdersWithLocal);
        setError(null);
      }
      
    } catch (error) {
      console.error('💥 Erro inesperado ao carregar ordens de serviço:', error);
      setError('Erro inesperado ao carregar ordens de serviço');
      setWorkOrders([]);
    } finally {
      setIsLoadingWorkOrders(false);
      setLoading(false);
    }
  };

  const loadManagerStats = () => {
    // Em produção, buscar estatísticas da API online em tempo real
    const currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
    
    setManagerStats({
      totalEvaluated: 156,
      ranking: 4.8,
      executed: { count: 136, percentage: 87.2 },
      delayed: { count: 8, percentage: 5.1 },
      pending: { count: 12, percentage: 7.7 },
      lastUpdate: new Date().toISOString(),
    });
  };

  const loadRealStats = async () => {
    try {
      console.log('📊 Carregando estatísticas reais para o manager:', user.id);
      
      // 1. Buscar OS finalizadas onde o usuário atual é supervisor
      const { data: finalizedOrders, error: finalizedError } = await supabase
        .from('ordem_servico')
        .select('id, data_agendamento')
        .eq('supervisor_id', parseInt(user.id))
        .eq('os_status_txt', 'Encerrada')
        .eq('ativo', 1);

      if (finalizedError) {
        console.error('❌ Erro ao buscar OS finalizadas:', finalizedError);
        throw finalizedError;
      }

      const totalFinalized = finalizedOrders?.length || 0;
      console.log(`✅ ${totalFinalized} OS finalizadas encontradas`);

      // 2. Buscar todas as OS finalizadas (independente do supervisor) para "executadas"
      const { data: allFinalizedOrders, error: allFinalizedError } = await supabase
        .from('ordem_servico')
        .select('id, data_agendamento')
        .eq('os_status_txt', 'Encerrada')
        .eq('ativo', 1);

      if (allFinalizedError) {
        console.error('❌ Erro ao buscar todas as OS finalizadas:', allFinalizedError);
        throw allFinalizedError;
      }

      const totalExecuted = allFinalizedOrders?.length || 0;
      console.log(`✅ ${totalExecuted} OS executadas (todas finalizadas) encontradas`);

      // 3. Buscar OS auditadas da tabela avaliacao_os
      const supervisedOrderIds = finalizedOrders?.map(order => order.id) || [];
      
      let totalAudited = 0;
      
      if (supervisedOrderIds.length > 0) {
        const { data: auditedOrders, error: auditedError } = await supabase
          .from('avaliacao_os')
          .select('ordem_servico_id')
          .in('ordem_servico_id', supervisedOrderIds);

        if (auditedError) {
          console.error('❌ Erro ao buscar OS auditadas:', auditedError);
          throw auditedError;
        }

        // Contar avaliações únicas (remover duplicatas caso existam)
        const uniqueAuditedIds = new Set(auditedOrders?.map(audit => audit.ordem_servico_id) || []);
        totalAudited = uniqueAuditedIds.size;
        console.log(`✅ ${totalAudited} OS auditadas encontradas`);
      }

      // 4. Buscar todas as OS auditadas para verificar quais foram avaliadas
      const { data: allAuditedOrders, error: allAuditedError } = await supabase
        .from('avaliacao_os')
        .select('ordem_servico_id');

      if (allAuditedError) {
        console.error('❌ Erro ao buscar todas as OS auditadas:', allAuditedError);
        throw allAuditedError;
      }

      const allAuditedIds = new Set(allAuditedOrders?.map((audit: any) => audit.ordem_servico_id) || []);

      // 5. Calcular OS atrasadas (finalizadas com data_agendamento anterior ao dia atual e não avaliadas)
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Zerar horas para comparar apenas a data

      const delayedOrders = allFinalizedOrders?.filter(order => {
        if (!order.data_agendamento) return false;
        
        const scheduledDate = new Date(order.data_agendamento);
        scheduledDate.setHours(0, 0, 0, 0); // Zerar horas para comparar apenas a data
        
        const isOverdue = scheduledDate < today; // data_agendamento menor que hoje = atrasada
        const isNotEvaluated = !allAuditedIds.has(order.id);
        
        return isOverdue && isNotEvaluated;
      }) || [];

      const totalDelayed = delayedOrders.length;
      console.log(`✅ ${totalDelayed} OS atrasadas encontradas`);

      // 6. Calcular OS pendentes de avaliação (todas as finalizadas que não foram avaliadas)
      const pendingOrders = allFinalizedOrders?.filter(order => 
        !allAuditedIds.has(order.id)
      ) || [];

      const totalPending = pendingOrders.length;
      console.log(`✅ ${totalPending} OS pendentes de avaliação encontradas`);
      
      setRealStats({
        totalFinalized,
        totalAudited,
        osStats: {
          executed: totalExecuted,
          delayed: totalDelayed,
          pending: totalPending,
        },
      });
      
      // Atualizar o totalEvaluated no managerStats
      setManagerStats(prev => ({
        ...prev,
        totalEvaluated: totalFinalized
      }));
      
    } catch (error) {
      console.error('💥 Erro ao carregar estatísticas reais:', error);
      // Em caso de erro, manter valores padrão
      setRealStats({
        totalFinalized: 0,
        totalAudited: 0,
        osStats: {
          executed: 0,
          delayed: 0,
          pending: 0,
        },
      });
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    
    try {
      setRefreshing(true);
      console.log('🔄 Pull-to-refresh iniciado - buscando dados frescos do servidor...');
      
      // Verificar conectividade
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        Alert.alert(
          'Sem conexão',
          'Não é possível atualizar os dados sem conexão com a internet.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Limpar cache para garantir dados frescos
      const { clearWorkOrdersCache } = require('../services/workOrderCacheService');
      await clearWorkOrdersCache(); // Sem userId para cache global
      
      // Buscar dados frescos do servidor - TODAS as OS
      console.log('🌐 Buscando dados frescos do servidor...');
      const freshData = await fetchWorkOrders(); // Busca todas as OS
      
      if (freshData.data && !freshData.error) {
        // Fazer cache dos dados frescos
        console.log('💾 Fazendo cache dos dados frescos...');
        const { cacheWorkOrders } = require('../services/workOrderCacheService');
        await cacheWorkOrders(freshData.data); // Sem userId para cache global
        
        // Aplicar filtros nos dados frescos
        console.log('🔍 Aplicando filtros nos dados frescos...');
        const filteredData = filterCachedWorkOrders(
          freshData.data,
          activeFilter,
          searchText.trim() || undefined
        );
        
        console.log(`✅ ${filteredData.length} ordens filtradas de ${freshData.data.length} totais`);
        
        // Aplicar dados frescos diretamente na tela (SEM status locais no pull-to-refresh)
        console.log('📱 Aplicando dados frescos do servidor (ignorando status locais)...');
        setWorkOrders(filteredData);
        
        // Recarregar estatísticas também
        await Promise.all([
          loadManagerStats(),
          loadRealStats()
        ]);
        
        console.log('🎉 Pull-to-refresh concluído - dados frescos do servidor aplicados');
      } else {
        console.error('❌ Erro ao buscar dados frescos:', freshData.error);
        Alert.alert(
          'Erro na Atualização',
          freshData.error || 'Não foi possível atualizar os dados do servidor.',
          [{ text: 'OK' }]
        );
        
        // Mesmo com erro, tentar recarregar do cache
        await loadWorkOrders();
      }
    } catch (error) {
      console.error('💥 Erro inesperado no pull-to-refresh:', error);
      Alert.alert(
        'Erro',
        'Erro inesperado ao atualizar dados. Tente novamente.',
        [{ text: 'OK' }]
      );
      
      // Em caso de erro, tentar recarregar normalmente
      await loadWorkOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const handleWorkOrderPress = (workOrder: WorkOrder) => {
    // Gestores podem ver detalhes de qualquer OS
    if (user.userType === 'gestor') {
      if (onOpenWorkOrder) {
        onOpenWorkOrder(workOrder);
      }
      return;
    }

    // Para técnicos, não permite clique em OS encerradas
    if (workOrder.status === 'finalizada' || workOrder.status === 'cancelada') {
      return;
    }

    // Para OS em andamento ou aguardando, navegar para a tela de detalhes
    if (workOrder.status === 'aguardando' || workOrder.status === 'em_progresso') {
      if (onOpenWorkOrder) {
        onOpenWorkOrder(workOrder);
      }
    }
  };

  const handleTabPress = (tab: 'home' | 'profile') => {
    setActiveTab(tab);
    if (onTabPress) {
      onTabPress(tab);
    }
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStatusBadgeColor = (workOrder: WorkOrder) => {
    const hasLocal = hasLocalStatus(workOrder);
    if (hasLocal) {
      console.log(`🎨 Cor do badge para OS ${workOrder.id} (status local): ${workOrder.status}`);
    }
    
    switch (workOrder.status) {
      case 'aguardando':
        return '#AFAFAF'; // Fundo aguardando
      case 'em_progresso':
        return '#f4a133'; // Fundo em progresso
      case 'finalizada':
        return '#60c0f4'; // Fundo finalizada
      case 'cancelada':
        return '#ef4444'; // red (mantido para cancelada)
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusBorderColor = (workOrder: WorkOrder) => {
    return 'white'; // Borda branca para todos os status
  };

  const getStatusTextColor = (workOrder: WorkOrder) => {
    return 'white'; // Texto branco para todos os status
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

  const isWorkOrderDelayed = (workOrder: WorkOrder) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const schedulingDate = new Date(workOrder.scheduling_date);
    schedulingDate.setHours(0, 0, 0, 0);
    
    const isDelayed = schedulingDate < today && 
                     workOrder.status !== 'finalizada' && 
                     workOrder.status !== 'cancelada';
    
    return isDelayed;
  };

  // Função para mesclar status locais com dados das OSs
  const mergeLocalStatus = async (workOrders: WorkOrder[]): Promise<WorkOrder[]> => {
    try {
      // Buscar todos os status locais
      const allLocalStatus = await getLocalWorkOrderStatuses();
      const localStatusCount = Object.keys(allLocalStatus).length;

      if (localStatusCount === 0) {
        return workOrders;
      }

      // Aplicar status locais às ordens de serviço
      let localStatusApplied = 0;
      const workOrdersWithLocalStatus = workOrders.map(workOrder => {
        const localStatus = allLocalStatus[workOrder.id.toString()];
        
        if (localStatus && !localStatus.synced) {
          localStatusApplied++;
          return {
            ...workOrder,
            status: localStatus.status as any,
          };
        }
        
        return workOrder;
      });

      return workOrdersWithLocalStatus;
    } catch (error) {
      console.error('❌ Erro ao mesclar status locais:', error);
      return workOrders;
    }
  };

  // Função para verificar se uma OS tem status local não sincronizado
  const hasLocalStatus = (workOrder: WorkOrder): boolean => {
    return (workOrder as any).isLocalStatus === true;
  };

  const filters = [
    { key: 'todas' as FilterStatus, label: 'TODAS', icon: 'list' },
    { key: 'aguardando' as FilterStatus, label: 'AGUARDANDO', icon: 'time' },
    { key: 'em_progresso' as FilterStatus, label: 'PROGRESSO', icon: 'settings' },
    { key: 'finalizada' as FilterStatus, label: 'FINALIZADAS', icon: 'checkmark-circle' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require('../img-ref/background_home.jpg')}
        style={styles.container}
        resizeMode="cover"
      >
        <StatusBar style="auto" />
        
        <Header user={user} />
        
        {/* ScrollView geral da página */}
        <ScrollView
          style={styles.pageScrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Cards de estatísticas */}
          <ManagerStatsCard realStats={realStats} />
          
          {/* Container branco com conteúdo - igual ao MainScreen */}
          <View style={styles.contentContainer}>
            {/* Seção de data e status - FIXO */}
            <View style={styles.dateStatusSection}>
              <View style={styles.dateContainer}>
                <Ionicons name="calendar-outline" size={16} color="#6b7280" />
                <Text style={styles.dateMainText}>{getCurrentDate()}</Text>
                <SyncStatusIndicator style={styles.syncIndicatorInline} />
              </View>
            </View>
            
            {/* Linha divisória - FIXO */}
            <View style={styles.dividerLine} />
            
            {/* Barra de busca - FIXO */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar por ID ou título"
                  placeholderTextColor="#9ca3af"
                  value={searchText}
                  onChangeText={setSearchText}
                />
                <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
              </View>
            </View>
            
            {/* Filtros - FIXO */}
            <View style={styles.filtersContainer}>
              {filters.map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  style={[
                    styles.filterButton,
                    activeFilter === filter.key && styles.activeFilterButton,
                  ]}
                  onPress={() => setActiveFilter(filter.key)}
                >
                  <Ionicons 
                    name={filter.icon as any} 
                    size={18} 
                    color={activeFilter === filter.key ? 'white' : '#6b7280'} 
                  />
                  <Text 
                    style={[
                      styles.filterText,
                      activeFilter === filter.key && styles.activeFilterText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                    minimumFontScale={0.8}
                  >
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Lista de WorkOrders - sem ScrollView interno, usa o scroll da página */}
            <View style={styles.workOrdersContainer}>
              {error && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={24} color="#ef4444" />
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity 
                    style={styles.retryButton}
                    onPress={loadWorkOrders}
                  >
                    <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {loading && !refreshing && (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Carregando ordens de serviço...</Text>
                </View>
              )}
              
              {!loading && !error && workOrders.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-text-outline" size={64} color="#9ca3af" />
                  <Text style={styles.emptyTitle}>Nenhuma ordem de serviço encontrada</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchText ? 'Tente usar outros termos de busca' : 'Não há ordens de serviço no momento'}
                  </Text>
                </View>
              )}
              
              {workOrders.map((workOrder, index) => (
                <TouchableOpacity 
                  key={workOrder.id} 
                  style={[
                    styles.workOrderCard,
                    {
                      backgroundColor: workOrder.status === 'em_progresso' ? '#f9dbb1' :
                                     workOrder.status === 'aguardando' ? '#dadadf' :
                                     workOrder.status === 'finalizada' ? '#9fd8f7' :
                                     'white',
                      borderColor: workOrder.status === 'em_progresso' ? '#fdb23b' :
                                 workOrder.status === 'aguardando' ? '#afafaf' :
                                 workOrder.status === 'finalizada' ? '#1cabec' :
                                 '#f3f4f6'
                    }
                  ]}
                  onPress={() => handleWorkOrderPress(workOrder)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardId}>#{workOrder.id}</Text>
                    {isWorkOrderDelayed(workOrder) && (
                      <View style={styles.delayBadge}>
                        <Ionicons name="warning" size={16} color="#ef4444" />
                        <Text style={styles.delayText}>EM ATRASO</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="build-outline" size={16} color="#000000" />
                    <Text style={styles.infoText}>{workOrder.title}</Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={16} color="#000000" />
                    <Text style={styles.infoText}>{workOrder.client}</Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={16} color="#000000" />
                    <Text style={styles.infoText}>{workOrder.address}</Text>
                  </View>

                  {/* Nova linha com supervisor */}
                  <View style={styles.infoRow}>
                    <Ionicons name="star" size={16} color="#f59e0b" />
                    <Text style={styles.infoText}>{workOrder.supervisor_name || 'Supervisor não definido'}</Text>
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.footerLeft}>
                      {/* Indicação de avaliação */}
                      {workOrder.is_evaluated && (
                        <View style={styles.evaluatedBadge}>
                          <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                          <Text style={styles.evaluatedText}>Avaliada</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.footerRight}>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusBadgeColor(workOrder), borderColor: getStatusBorderColor(workOrder) }
                      ]}>
                        <View style={styles.statusBadgeContent}>
                          <Text style={[
                            styles.statusText,
                            { color: getStatusTextColor(workOrder) }
                          ]}>
                            {getStatusText(workOrder.status)}
                          </Text>
                          {hasLocalStatus(workOrder) && (
                            <Ionicons 
                              name="phone-portrait" 
                              size={12} 
                              color="white" 
                              style={styles.localStatusIcon}
                            />
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
              
              {/* Espaço extra no final */}
              <View style={styles.bottomSpacer} />
            </View>
          </View>
        </ScrollView>
        
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />
      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  pageScrollContainer: {
    flex: 1,
    marginBottom: 1, // Espaço para o BottomNavigation
  },
  // Container principal - igual ao MainScreen
  contentContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 15,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    overflow: 'hidden',
  },
  // Seção de data e status
  dateStatusSection: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMainText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#374151',
    marginLeft: 6,
  },
  syncIndicatorInline: {
    marginLeft: 10,
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 15,
  },
  // Barra de busca
  searchContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 15,
    height: 45,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  searchIcon: {
    marginLeft: 10,
  },
  // Filtros
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingBottom: 15,
    gap: 5,
  },
  filterButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    minWidth: 50,
    minHeight: 60,
    gap: 4,
  },
  activeFilterButton: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 10,
  },
  activeFilterText: {
    color: 'white',
  },
  // Scroll container das work orders - removido pois agora usa o scroll geral
  workOrdersContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  // Cards das work orders - igual ao MainScreen
  workOrderCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 16,
    marginHorizontal: 5,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
  },
  statusBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#000000',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  delayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  delayText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  // Estados vazios e de erro
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 20,
    marginHorizontal: 5,
    marginVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  localStatusIcon: {
    marginLeft: 4,
  },
  bottomSpacer: {
    height: 20,
  },
  evaluatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5f2e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1fadf',
  },
  evaluatedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});

export default ManagerScreen; 