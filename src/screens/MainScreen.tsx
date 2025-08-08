import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  TextInput,
  ImageBackground,
  Image,
  SafeAreaView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { RFValue } from 'react-native-responsive-fontsize';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import BottomNavigation from '../components/BottomNavigation';
import WorkOrderModal from '../components/WorkOrderModal';
import SyncStatusIndicator from '../components/SyncStatusIndicator';
import { WorkOrder, User, FilterStatus } from '../types/workOrder';
import { fetchWorkOrdersWithFilters } from '../services/workOrderService';
import { useAuth } from '../contexts/AuthContext';
import { getLocalWorkOrderStatuses, cleanSyncedLocalStatuses } from '../services/localStatusService';
import { preloadAndCacheAllServiceSteps } from '../services/serviceStepsService';
import { getWorkOrdersWithCache, getWorkOrdersCacheStats, updateCacheAfterOSFinalizada } from '../services/workOrderCacheService';
import { registerSyncCallback, registerOSFinalizadaCallback } from '../services/integratedOfflineService';
// TEMPORARIAMENTE REMOVIDO: importações de cacheService para evitar erro SQLite
// import { preloadAllWorkOrdersData, shouldPreload, getCachedWorkOrders, getPreloadStatus } from '../services/cacheService';

interface MainScreenProps {
  user: User;
  onTabPress?: (tab: 'home' | 'profile') => void;
  onOpenWorkOrder?: (workOrder: WorkOrder) => void;
  refreshTrigger?: number; // Para forçar refresh
}

const MainScreen: React.FC<MainScreenProps> = ({ user, onTabPress, onOpenWorkOrder, refreshTrigger }) => {
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('todas');
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);

  // Flags de controle para prevenir loops infinitos
  const [isLoadingWorkOrders, setIsLoadingWorkOrders] = useState(false);
  const [lastRefreshTrigger, setLastRefreshTrigger] = useState<number>(0);
  const [lastFilterKey, setLastFilterKey] = useState<string>('');

  const { appUser, isConnected } = useAuth();

  // Efeito para carregar as ordens de serviço assim que o usuário for identificado
  useEffect(() => {
    if (appUser) {
      loadWorkOrders();
    }
    // A intencional ausência de dependências de `loadWorkOrders` é para
    // garantir que este hook só seja reativado quando o `appUser` mudar.
  }, [appUser]);

  // Efeito para registrar listeners e callbacks uma única vez
  useEffect(() => {
    // Pré-carregar todos os dados quando online (em background)
    preloadAllData();
    
    const unsubscribeSync = registerSyncCallback(async (result) => {
      if (result.synced > 0) {
        // Apenas recarregar se não há status locais pendentes
        setTimeout(async () => {
          try {
            const localStatuses = await getLocalWorkOrderStatuses();
            const hasLocalChanges = Object.values(localStatuses).some(status => !status.synced);
            
            if (!hasLocalChanges) {
              if (isLoadingWorkOrders) {
                return;
              }
              await loadWorkOrders();
            }
          } catch (error) {
            // Erro não crítico
          }
        }, 2000);
      }
    });
    
    const unsubscribeOSFinalizada = registerOSFinalizadaCallback(async (workOrderId) => {
      try {
        await loadWorkOrders();
      } catch (error) {
        // Erro não crítico
      }
    });

    return () => {
      unsubscribeSync();
      unsubscribeOSFinalizada();
    };
  }, []); // Array de dependências vazio para rodar apenas uma vez.

  // Sistema de refresh automático a cada 3 minutos quando online - MANTER
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout;

    const startAutoRefresh = async () => {
      const netInfo = await NetInfo.fetch();
      
      if (netInfo.isConnected && appUser) {
        console.log('🔄 Iniciando refresh automático a cada 3 minutos...');
        
        refreshInterval = setInterval(async () => {
          const currentNetInfo = await NetInfo.fetch();
          
          if (currentNetInfo.isConnected) {
            console.log('⏰ Refresh automático: atualizando dados do servidor...');
            await loadWorkOrders();
          } else {
            console.log('📱 Offline: pulando refresh automático');
          }
        }, 3 * 60 * 1000); // 3 minutos
      }
    };

    startAutoRefresh();

    return () => {
      if (refreshInterval) {
        console.log('🛑 Parando refresh automático');
        clearInterval(refreshInterval);
      }
    };
  }, [appUser, isConnected]);

  // Recarregar quando filtros mudarem - MANTER para funcionalidade dos filtros
  useEffect(() => {
    const newFilterKey = `${activeFilter}_${searchText}`;
    
    // Proteção contra loop: só recarregar se a chave de filtro realmente mudou
    if (!loading && !isLoadingWorkOrders && newFilterKey !== lastFilterKey) {
      console.log('🔄 Filtros mudaram:', { activeFilter, searchText, oldKey: lastFilterKey, newKey: newFilterKey });
      setLastFilterKey(newFilterKey);
      loadWorkOrders();
    }
  }, [activeFilter, searchText, loading, isLoadingWorkOrders, lastFilterKey]);

  // Recarregar quando refreshTrigger mudar (forçado pelo App) - MANTER para quando finaliza OS
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && refreshTrigger !== lastRefreshTrigger && !isLoadingWorkOrders) {
      console.log('🔄 Refresh forçado da MainScreen, recarregando OSs...', { refreshTrigger, lastRefreshTrigger });
      setLastRefreshTrigger(refreshTrigger);
      loadWorkOrders();
    }
  }, [refreshTrigger, lastRefreshTrigger, isLoadingWorkOrders]);

  // Validação de Funcionalidade: Online - Listagem das OS, filtros de busca id ou titulo e botoes status - Validado pelo usuário. Não alterar sem nova validação.
  const loadWorkOrders = async () => {
    if (isLoadingWorkOrders) return;

    // Apenas prossiga se o usuário estiver carregado.
    if (!appUser) {
      setLoading(false);
      return;
    }

    setIsLoadingWorkOrders(true);
    setLoading(true);
    setError(null);
    
    const userId = appUser.userType === 'tecnico' ? appUser.id : undefined;

    try {
      const result = await getWorkOrdersWithCache(
        () => fetchWorkOrdersWithFilters(userId, 'todas', undefined),
        userId,
        activeFilter,
        searchText.trim() || undefined
      );

      if (result.error) {
        setError(result.error);
      }
      
      // Mesclar status locais (ex.: finalização offline) para refletir imediatamente
      const merged = await mergeLocalStatus(result.data || []);
      setWorkOrders(merged);

    } catch (err) {
      setError('Um erro inesperado ocorreu ao carregar as ordens.');
      setWorkOrders([]);
    } finally {
      setLoading(false);
      setIsLoadingWorkOrders(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    try {
      if (!appUser) {
        setRefreshing(false);
        return;
      }
      
      const userId = appUser?.userType === 'tecnico' ? appUser.id : undefined;
      const netInfo = await NetInfo.fetch();
      
      if (!netInfo.isConnected) {
        Alert.alert('Sem Conexão', 'Você precisa estar online para atualizar as ordens de serviço.', [{ text: 'OK' }]);
        setRefreshing(false);
        return;
      }
      
      // 1. BUSCAR DADOS NOVOS PRIMEIRO
      const freshData = await fetchWorkOrdersWithFilters(userId, 'todas', undefined);
      
      // 2. SE A BUSCA FALHAR, NÃO FAZER NADA E MANTER O CACHE ANTIGO
      if (freshData.error || !freshData.data) {
        Alert.alert('Erro na Atualização', freshData.error || 'Não foi possível buscar novas ordens de serviço. Seus dados offline foram mantidos.', [{ text: 'OK' }]);
        setRefreshing(false);
        return;
      }
      
      // 3. SE A BUSCA TIVER SUCESSO, ATUALIZAR O CACHE
      const { cacheWorkOrders, clearWorkOrdersCache, filterCachedWorkOrders } = require('../services/workOrderCacheService');
      
      // Limpa o cache antigo e salva os dados novos de forma segura
      await clearWorkOrdersCache(userId);
      await cacheWorkOrders(freshData.data, userId);
      
      // Aplicar filtros e atualizar a tela
      const filteredData = filterCachedWorkOrders(
        freshData.data,
        activeFilter,
        searchText.trim() || undefined
      );
      setWorkOrders(filteredData);
      
    } catch (error) {
      Alert.alert('Erro', 'Ocorreu um erro inesperado ao tentar atualizar.', [{ text: 'OK' }]);
    } finally {
      setRefreshing(false);
    }
  };

  // Validação de Funcionalidade: Online - Modal ao clicar na OS - Validado pelo usuário. Não alterar sem nova validação.
  const handleWorkOrderPress = (workOrder: WorkOrder) => {
    // Não permite clique em OS encerradas (finalizadas ou canceladas)
    if (workOrder.status === 'finalizada' || workOrder.status === 'cancelada') {
      return;
    }

    // Para OS em andamento ou aguardando, mostra o modal
    if (workOrder.status === 'aguardando' || workOrder.status === 'em_progresso') {
      setSelectedWorkOrder(workOrder);
      setModalVisible(true);
    }
  };

  // Validação de Funcionalidade: Online - Página após abrir modal - Validado pelo usuário. Não alterar sem nova validação.
  const handleModalConfirm = () => {
    if (selectedWorkOrder && onOpenWorkOrder) {
      onOpenWorkOrder(selectedWorkOrder);
    }
    setModalVisible(false);
    setSelectedWorkOrder(null);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedWorkOrder(null);
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

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'alta':
        return 'Alta Prioridade';
      case 'media':
        return 'Média Prioridade';
      case 'baixa':
        return 'Baixa Prioridade';
      default:
        return priority;
    }
  };

  const filters = [
    { key: 'todas' as FilterStatus, label: 'TODAS', icon: 'list' },
    { key: 'aguardando' as FilterStatus, label: 'AGUARDANDO', icon: 'time' },
    { key: 'em_progresso' as FilterStatus, label: 'PROGRESSO', icon: 'settings' },
    { key: 'finalizada' as FilterStatus, label: 'FINALIZADAS', icon: 'checkmark-circle' },
  ];

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
        setWorkOrders(workOrders);
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

      setWorkOrders(workOrdersWithLocalStatus);
      
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

  // Função para pré-carregar etapas em background
  const preloadServiceSteps = async () => {
    try {
      await preloadAndCacheAllServiceSteps();
    } catch (error) {
      console.error('❌ Erro no pré-carregamento de etapas:', error);
    }
  };

  // Função para mostrar estatísticas do cache (debug)
  const showCacheStats = async () => {
    const stats = await getWorkOrdersCacheStats();
    Alert.alert(
      'Cache Stats',
      `Cached OSs: ${stats.itemCount}\nLast Update: ${stats.lastUpdate || 'Never'}\nHas Cache: ${stats.hasCache ? 'Yes' : 'No'}\nCache Age: ${stats.cacheAge}h`,
      [{ text: 'OK' }]
    );
  };

  // Pré-carregamento inicial quando online
  const preloadAllData = async () => {
    try {
      // Verificar se há conexão
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        return;
      }
      
      // Aguardar um pouco para não atrapalhar o carregamento principal
      setTimeout(async () => {
        await preloadServiceSteps();
      }, 2000);
    } catch (error) {
      console.error('❌ Erro no pré-carregamento:', error);
    }
  };

  // 🆕 NOVA FUNÇÃO: Pré-carrega dados específicos das OSs
  const preloadWorkOrdersData = async (workOrders: WorkOrder[], wasFromCache: boolean = false) => {
    try {
      // Verificar se o pré-carregamento é necessário
      // const needsPreload = await shouldPreload(workOrders); // TEMPORARIAMENTE REMOVIDO
      
      // if (!needsPreload && !wasFromCache) { // TEMPORARIAMENTE REMOVIDO
      //   return; // TEMPORARIAMENTE REMOVIDO
      // } // TEMPORARIAMENTE REMOVIDO
      
      // Verificar conexão
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        return;
      }
      
      // Executar pré-carregamento em background (não bloquear UI)
      setTimeout(async () => {
        try {
          // const { success, cached, errors } = await preloadAllWorkOrdersData(workOrders); // TEMPORARIAMENTE REMOVIDO
          
          // if (success) { // TEMPORARIAMENTE REMOVIDO
          //   console.log(`✅ ${cached} tipos de OS preparados para uso offline`); // TEMPORARIAMENTE REMOVIDO
          // } else { // TEMPORARIAMENTE REMOVIDO
          //   console.log(`⚠️ ${cached} de ${cached + errors.length} tipos preparados`); // TEMPORARIAMENTE REMOVIDO
          // } // TEMPORARIAMENTE REMOVIDO
        } catch (preloadError) {
          console.error('💥 Erro no pré-carregamento em background:', preloadError);
        }
      }, 1000); // Aguardar 1 segundo para não impactar a UI
      
    } catch (error) {
      console.error('💥 Erro na função preloadWorkOrdersData:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* View para simular background da status bar */}
      <View style={styles.statusBarBackground} />
      <ImageBackground
        source={require('../img-ref/background_home.jpg')}
        style={styles.container}
        resizeMode="cover"
      >
        <StatusBar style="light-content" />
        
        {/* Header com imagem de background - FIXO */}
        <View style={styles.headerWrapper}>
          <ImageBackground
            source={require('../img-ref/container_perfil.png')}
            style={styles.headerImage}
            resizeMode="cover"
          >
            <View style={styles.header}>
              <View style={styles.userSection}>
                <View style={styles.userIcon}>
                  {user.url_foto ? (
                    <Image source={{ uri: user.url_foto }} style={styles.userPhoto} />
                  ) : (
                    <Ionicons name="person" size={32} color="white" />
                  )}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userRole}>{user.role}</Text>
                </View>
              </View>
            </View>
          </ImageBackground>
        </View>
        
        {/* Container branco com conteúdo - FIXO */}
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
              {/* Validação de Funcionalidade: Online - Listagem das OS, filtros de busca id ou titulo e botoes status - Validado pelo usuário. Não alterar sem nova validação. */}
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
            {/* Validação de Funcionalidade: Online - Listagem das OS, filtros de busca id ou titulo e botoes status - Validado pelo usuário. Não alterar sem nova validação. */}
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
          
          {/* Lista de WorkOrders - APENAS ESTA PARTE TEM SCROLL */}
          <ScrollView
            style={styles.workOrdersScrollContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
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
                  <Text style={styles.emptyTitle}>
                    {isConnected ? 'Nenhuma ordem de serviço encontrada' : 'Sem ordens de serviço offline'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {isConnected 
                      ? (searchText ? 'Tente usar outros termos de busca' : 'Não há ordens de serviço no momento')
                      : 'Conecte-se à internet e faça login para baixar suas ordens de serviço'
                    }
                  </Text>
                </View>
              )}
              
              {/* Validação de Funcionalidade: Online - Listagem das OS, filtros de busca id ou titulo e botoes status - Validado pelo usuário. Não alterar sem nova validação. */}
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

                  <View style={styles.cardFooter}>
                    <View style={styles.footerLeft}>
                      {/* Botão de sincronização removido - sincronização é automática */}
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
          </ScrollView>
        </View>
        
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />

        {/* Validação de Funcionalidade: Online - Modal ao clicar na OS - Validado pelo usuário. Não alterar sem nova validação. */}
        {selectedWorkOrder && (
          <WorkOrderModal
            visible={modalVisible}
            onConfirm={handleModalConfirm}
            onClose={handleModalClose}
            workOrder={selectedWorkOrder}
          />
        )}
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
  headerWrapper: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerImage: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    paddingTop: 15,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  userIcon: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    overflow: 'hidden',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: 'white',
    fontSize: RFValue(18),
    fontWeight: 'bold',
  },
  userRole: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: RFValue(14),
  },
  contentContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 5,
    borderRadius: 15,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    flex: 1,
    overflow: 'hidden',
  },
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
    fontSize: RFValue(16),
    color: '#374151',
  },
  searchIcon: {
    marginLeft: 10,
  },
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
    fontSize: RFValue(8),
    fontWeight: 'bold',
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 10,
  },
  activeFilterText: {
    color: 'white',
  },
  workOrdersContainer: {
    paddingBottom: 10,
  },
  workOrderCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 16,
    marginHorizontal: 15,
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
    fontSize: RFValue(16),
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
    fontSize: RFValue(12),
    fontWeight: 'bold',
    marginLeft: 4,
  },
  bottomSpacer: {
    height: 20,
  },
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
    fontSize: RFValue(14),
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
  userPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 32.5,
  },
  workOrdersScrollContainer: {
    flex: 1,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 20,
    marginHorizontal: 15,
    marginVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#ef4444',
    fontSize: RFValue(14),
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
    fontSize: RFValue(12),
    fontWeight: 'bold',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: RFValue(14),
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: RFValue(14),
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  localStatusIcon: {
    marginLeft: 4,
  },
  statusBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: Constants.statusBarHeight,
    backgroundColor: '#3b82f6',
  },
});

export default MainScreen; 