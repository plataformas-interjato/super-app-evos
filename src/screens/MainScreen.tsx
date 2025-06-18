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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { RFValue } from 'react-native-responsive-fontsize';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BottomNavigation from '../components/BottomNavigation';
import WorkOrderModal from '../components/WorkOrderModal';
import SyncStatusIndicator from '../components/SyncStatusIndicator';
import { WorkOrder, User, FilterStatus } from '../types/workOrder';
import { fetchWorkOrdersWithFilters } from '../services/workOrderService';
import { useAuth } from '../contexts/AuthContext';
import { getLocalWorkOrderStatuses, cleanSyncedLocalStatuses } from '../services/localStatusService';
import { preloadAndCacheAllServiceSteps } from '../services/serviceStepsService';
import { getWorkOrdersWithCache, getWorkOrdersCacheStats, updateCacheAfterOSFinalizada } from '../services/workOrderCacheService';
import { registerSyncCallback, registerOSFinalizadaCallback } from '../services/offlineService';
import { preloadAllWorkOrdersData, shouldPreload, getCachedWorkOrders, getPreloadStatus } from '../services/cacheService';

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
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);

  // Flags de controle para prevenir loops infinitos
  const [isLoadingWorkOrders, setIsLoadingWorkOrders] = useState(false);
  const [lastRefreshTrigger, setLastRefreshTrigger] = useState<number>(0);
  const [lastFilterKey, setLastFilterKey] = useState<string>('');

  const { appUser } = useAuth();

  useEffect(() => {
    // CARREGAMENTO INICIAL - apenas na primeira vez
    loadWorkOrders();
    
    // Verificar conexão inicial
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected || false);
    });
    
    // Listener para mudanças de conectividade
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected || false);
    });

    // Pré-carregar todos os dados quando online (em background)
    preloadAllData();
    
    // Registrar callback para sincronização automática
    const unsubscribeSync = registerSyncCallback(async (result) => {
      if (result.synced > 0) {
        console.log(`🔄 ${result.synced} ações sincronizadas - verificando se precisamos atualizar dados`);
        
        // IMPORTANTE: Não atualizar dados automaticamente após sincronização
        // para evitar sobrescrever status locais "finalizada" com status do servidor
        console.log('✅ Sincronização concluída - mantendo status locais para evitar regressão');
        
        // Apenas recarregar se não há status locais pendentes
        setTimeout(async () => {
          try {
            const localStatuses = await getLocalWorkOrderStatuses();
            const hasLocalChanges = Object.values(localStatuses).some(status => !status.synced);
            
            if (!hasLocalChanges) {
              console.log('📱 Nenhum status local pendente - pode atualizar dados do servidor');
              
              // Verificar se ainda não está carregando para evitar conflitos
              if (isLoadingWorkOrders) {
                console.log('⚠️ loadWorkOrders em execução, pulando atualização pós-sync');
                return;
              }
              
              const userId = appUser?.userType === 'tecnico' ? appUser.id : undefined;
              
              const { data: freshData, error: fetchError } = await fetchWorkOrdersWithFilters(
                userId,
                activeFilter,
                searchText.trim() || undefined
              );
              
              if (!fetchError && freshData) {
                const mergedWorkOrders = await mergeLocalStatus(freshData);
                setWorkOrders(mergedWorkOrders);
              }
            } else {
              console.log('⚠️ Status locais pendentes - não atualizando para preservar mudanças');
            }
          } catch (error) {
            console.error('❌ Erro ao verificar status locais após sincronização:', error);
          }
        }, 2000);
      }
    });
    
    // Callback para OS finalizada - MANTER para atualizar quando OS é finalizada
    const unsubscribeOSFinalizada = registerOSFinalizadaCallback(async (workOrderId) => {
      console.log(`✅ OS ${workOrderId} finalizada online - atualizando home INSTANTANEAMENTE`);
      
      try {
        // ATUALIZAÇÃO INSTANTÂNEA: Não usar setTimeout, atualizar imediatamente
        console.log('🔄 Atualizando home imediatamente após OS finalizada...');
        await loadWorkOrders();
        console.log('✅ Home atualizada instantaneamente após OS finalizada online');
        
      } catch (error) {
        console.error('❌ Erro ao processar OS finalizada:', error);
        // Mesmo com erro, tentar recarregar
        await loadWorkOrders();
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSync();
      unsubscribeOSFinalizada();
    };
  }, [appUser]);

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

  const loadWorkOrders = async () => {
    // Proteção contra execuções simultâneas
    if (isLoadingWorkOrders) {
      console.log('⚠️ loadWorkOrders já em execução, ignorando nova chamada');
      return;
    }

    try {
      setIsLoadingWorkOrders(true);
      setError(null);
      
      // Verificação de segurança: se não há usuário, não carregar
      if (!appUser) {
        console.log('⚠️ Usuário não disponível, pulando carregamento de OSs');
        setLoading(false);
        return;
      }
      
      const userId = appUser?.userType === 'tecnico' ? appUser.id : undefined;
      
      console.log('🔍 Carregando ordens de serviço com cache...');
      console.log('👤 Usuário:', appUser?.name, '- Tipo:', appUser?.userType);
      console.log('🔢 ID numérico do usuário:', appUser?.id);
      console.log('🔧 UserId para filtro:', userId);
      console.log('📋 Filtro ativo:', activeFilter);
      console.log('🔎 Busca:', searchText);
      
      // Verificar conectividade antes de fazer a requisição
      const netInfo = await NetInfo.fetch();
      console.log('📶 Status de conectividade:', netInfo.isConnected ? 'Online' : 'Offline');
      
      // MELHORADO: Se online, sempre buscar dados frescos para garantir status atualizados
      let data, fetchError, fromCache;
      
      if (netInfo.isConnected) {
        console.log('🌐 ONLINE: Buscando dados frescos para garantir status atualizados');
        
        // Limpar cache primeiro para garantir dados frescos
        const { clearWorkOrdersCache } = require('../services/workOrderCacheService');
        await clearWorkOrdersCache(userId);
        
        // Buscar diretamente do servidor
        const freshResult = await fetchWorkOrdersWithFilters(
          userId,
          'todas', // Buscar todas para fazer cache completo
          undefined // Sem filtro de busca para cache completo
        );
        
        data = freshResult.data;
        fetchError = freshResult.error;
        fromCache = false;
        
        // Fazer cache dos dados frescos
        if (data && !fetchError) {
          const { cacheWorkOrders } = require('../services/workOrderCacheService');
          await cacheWorkOrders(data, userId);
          
          // Aplicar filtros
          const { filterCachedWorkOrders } = require('../services/workOrderCacheService');
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
          () => fetchWorkOrdersWithFilters(
            userId,
            'todas',
            undefined
          ),
          userId,
          activeFilter,
          searchText.trim() || undefined
        );
        
        data = result.data;
        fetchError = result.error;
        fromCache = result.fromCache;
      }

      if (fetchError) {
        setError(fetchError);
        console.error('❌ Erro ao carregar ordens de serviço:', fetchError);
        setWorkOrders([]);
      } else {
        console.log(`✅ ${data?.length || 0} ordens de serviço carregadas ${fromCache ? 'do cache' : 'do servidor'}`);
        
        // Mesclar com status locais (importante para refletir mudanças offline)
        const mergedWorkOrders = await mergeLocalStatus(data || []);
        setWorkOrders(mergedWorkOrders);
        
        // Mostrar indicador se dados vieram do cache
        if (fromCache) {
          console.log(`📱 Dados carregados do cache ${netInfo.isConnected ? 'online' : 'offline'}`);
        }
        
        // 🚀 NOVO: Pré-carregar todas as informações das OSs automaticamente
        if (data && data.length > 0) {
          console.log('🚀 Iniciando pré-carregamento automático das OSs...');
          preloadWorkOrdersData(data, fromCache);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro inesperado ao carregar ordens de serviço';
      setError(errorMessage);
      console.error('💥 Erro inesperado:', err);
      setWorkOrders([]);
    } finally {
      setLoading(false);
      setIsLoadingWorkOrders(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    
    try {
      console.log('🔄 Pull-to-refresh: forçando atualização do Supabase...');
      
      // Verificação de segurança: se não há usuário, não fazer refresh
      if (!appUser) {
        console.log('⚠️ Usuário não disponível, pulando refresh');
        setRefreshing(false);
        return;
      }
      
      const userId = appUser?.userType === 'tecnico' ? appUser.id : undefined;
      console.log('👤 UserId para refresh:', userId);
      
      // Verificar conectividade
      const netInfo = await NetInfo.fetch();
      console.log('📶 Status de conectividade no refresh:', netInfo.isConnected ? 'Online' : 'Offline');
      
      if (!netInfo.isConnected) {
        console.log('📱 Offline: não é possível atualizar do servidor');
        Alert.alert(
          'Sem Conexão',
          'Não é possível atualizar os dados sem conexão com a internet.',
          [{ text: 'OK' }]
        );
        setRefreshing(false);
        return;
      }
      
      // PRIMEIRO: Limpar o cache existente para garantir dados frescos
      console.log('🗑️ Limpando cache antes do refresh...');
      const { clearWorkOrdersCache } = require('../services/workOrderCacheService');
      await clearWorkOrdersCache(userId);
      
      // SEGUNDO: Buscar dados frescos do servidor DIRETAMENTE
      console.log('🌐 Buscando dados frescos do Supabase...');
      const freshData = await fetchWorkOrdersWithFilters(
        userId,
        'todas', // Buscar todas para fazer cache completo
        undefined // Sem filtro de busca para cache completo
      );
      
      console.log('📊 Resultado da busca fresca:', {
        success: !freshData.error,
        dataCount: freshData.data?.length || 0,
        error: freshData.error
      });
      
      if (freshData.data && !freshData.error) {
        // TERCEIRO: Fazer cache dos dados frescos
        console.log('💾 Fazendo cache dos dados frescos...');
        const { cacheWorkOrders } = require('../services/workOrderCacheService');
        await cacheWorkOrders(freshData.data, userId);
        
        // QUARTO: Aplicar filtros nos dados frescos
        console.log('🔍 Aplicando filtros nos dados frescos...');
        const { filterCachedWorkOrders } = require('../services/workOrderCacheService');
        const filteredData = filterCachedWorkOrders(
          freshData.data,
          activeFilter,
          searchText.trim() || undefined
        );
        
        console.log(`✅ ${filteredData.length} ordens filtradas de ${freshData.data.length} totais`);
        
        // QUINTO: Aplicar dados frescos diretamente na tela (SEM status locais no pull-to-refresh)
        console.log('📱 Aplicando dados frescos do servidor (ignorando status locais)...');
        setWorkOrders(filteredData);
        
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
      const needsPreload = await shouldPreload(workOrders);
      
      if (!needsPreload && !wasFromCache) {
        return;
      }
      
      // Verificar conexão
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        return;
      }
      
      // Executar pré-carregamento em background (não bloquear UI)
      setTimeout(async () => {
        try {
          const { success, cached, errors } = await preloadAllWorkOrdersData(workOrders);
          
          if (success) {
            console.log(`✅ ${cached} tipos de OS preparados para uso offline`);
          } else {
            console.log(`⚠️ ${cached} de ${cached + errors.length} tipos preparados`);
          }
        } catch (preloadError) {
          console.error('💥 Erro no pré-carregamento em background:', preloadError);
        }
      }, 1000); // Aguardar 1 segundo para não impactar a UI
      
    } catch (error) {
      console.error('💥 Erro na função preloadWorkOrdersData:', error);
    }
  };

  // Função para limpar todo o cache/localStorage
  const handleClearCache = async () => {
    Alert.alert(
      'Limpar Cache',
      'Isso irá limpar todos os dados em cache do aplicativo. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Limpar', 
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Iniciando limpeza completa do cache...');
              
              // Limpar cache de work orders
              const { clearWorkOrdersCache } = require('../services/workOrderCacheService');
              const userId = appUser?.userType === 'tecnico' ? appUser.id : undefined;
              await clearWorkOrdersCache(userId);
              
              // Limpar cache de etapas (usando a função que existe)
              const { clearServiceCache } = require('../services/cacheService');
              await clearServiceCache();
              
              // Limpar ações offline
              const { clearAllOfflineActions } = require('../services/offlineService');
              await clearAllOfflineActions();
              
              // Limpar status locais manualmente
              const keys = await AsyncStorage.getAllKeys();
              const localStatusKeys = keys.filter(key => key.startsWith('local_work_order_status_'));
              if (localStatusKeys.length > 0) {
                await AsyncStorage.multiRemove(localStatusKeys);
                console.log(`🗑️ Removidos ${localStatusKeys.length} status locais`);
              }
              
              // Limpar outros dados específicos
              const keysToRemove = [
                'completed_steps_',
                'user_preferences',
                'app_settings'
              ];
              
              // Buscar todas as chaves e remover as que começam com os prefixos
              const allKeys = await AsyncStorage.getAllKeys();
              const keysToDelete = allKeys.filter(key => 
                keysToRemove.some(prefix => key.startsWith(prefix))
              );
              
              if (keysToDelete.length > 0) {
                await AsyncStorage.multiRemove(keysToDelete);
                console.log(`🗑️ Removidas ${keysToDelete.length} chaves adicionais do AsyncStorage`);
              }
              
              console.log('✅ Cache limpo com sucesso');
              
              Alert.alert(
                'Cache Limpo',
                'Todos os dados em cache foram removidos. O aplicativo irá recarregar os dados do servidor.',
                [{ 
                  text: 'OK', 
                  onPress: () => {
                    // Recarregar dados após limpar cache
                    loadWorkOrders();
                  }
                }]
              );
            } catch (error) {
              console.error('❌ Erro ao limpar cache:', error);
              Alert.alert(
                'Erro',
                'Não foi possível limpar o cache completamente. Tente novamente.',
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require('../img-ref/background_home.jpg')}
        style={styles.container}
        resizeMode="cover"
      >
        <StatusBar style="auto" />
        
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
                <TouchableOpacity 
                  style={styles.clearCacheButton}
                  onPress={handleClearCache}
                >
                  <Ionicons name="trash-outline" size={20} color="white" />
                </TouchableOpacity>
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
  clearCacheButton: {
    padding: 5,
  },
});

export default MainScreen; 