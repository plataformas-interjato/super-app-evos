import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  SafeAreaView,
  ImageBackground,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import Header from '../components/Header';
import ManagerStatsCard from '../components/ManagerStatsCard';
import SearchBar from '../components/SearchBar';
import WorkOrderCard from '../components/WorkOrderCard';
import BottomNavigation from '../components/BottomNavigation';
import WorkOrderModal from '../components/WorkOrderModal';

import { WorkOrder, User } from '../types/workOrder';
import { ManagerStats } from '../types/manager';
import { supabase } from '../services/supabase';

interface ManagerScreenProps {
  user: User;
  onTabPress?: (tab: 'home' | 'profile') => void;
}

const ManagerScreen: React.FC<ManagerScreenProps> = ({ user, onTabPress }) => {
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
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
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);

  // Dados de exemplo - em produção, viriam de uma API online
  const mockWorkOrders: WorkOrder[] = [
    {
      id: 1,
      title: 'Manutenção Sistema Elétrico',
      client: 'Empresa ABC Ltda',
      address: 'Rua das Flores, 123 - Centro',
      priority: 'alta',
      status: 'aguardando',
      scheduling_date: new Date(),
      sync: 1, // Campo mantido por compatibilidade com a interface
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      title: 'Instalação de Equipamentos',
      client: 'Indústria XYZ S.A.',
      address: 'Av. Industrial, 456 - Distrito Industrial',
      priority: 'media',
      status: 'em_progresso',
      scheduling_date: new Date(),
      sync: 1, // Campo mantido por compatibilidade com a interface
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  useEffect(() => {
    loadWorkOrders();
    loadManagerStats();
    loadRealStats();
  }, []);

  const loadWorkOrders = () => {
    // Em produção, buscar dados da API online em tempo real
    setWorkOrders(mockWorkOrders);
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

  const handleRefresh = () => {
    setRefreshing(true);
    // Simula uma requisição à API online
    setTimeout(() => {
      loadWorkOrders();
      loadManagerStats();
      loadRealStats();
      setRefreshing(false);
    }, 1500);
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
    if (selectedWorkOrder) {
      console.log('Abrir OS:', selectedWorkOrder.id);
      // Aqui você pode implementar a lógica para abrir a OS
      // Por exemplo, navegar para uma tela de detalhes da OS
    }
    setModalVisible(false);
    setSelectedWorkOrder(null);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedWorkOrder(null);
  };

  const handleWorkOrderRefresh = (workOrder: WorkOrder) => {
    Alert.alert(
      'Atualizar',
      `Atualizar OS #${workOrder.id}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Atualizar', onPress: () => console.log('Atualizar OS:', workOrder.id) },
      ]
    );
  };

  const handleTabPress = (tab: 'home' | 'profile') => {
    setActiveTab(tab);
    if (onTabPress) {
      onTabPress(tab);
    }
  };

  const filteredWorkOrders = workOrders.filter((workOrder) => {
    const matchesSearch = workOrder.title.toLowerCase().includes(searchText.toLowerCase()) ||
                         workOrder.client.toLowerCase().includes(searchText.toLowerCase()) ||
                         workOrder.id.toString().includes(searchText);
    
    return matchesSearch;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require('../img-ref/background_home.jpg')}
        style={styles.container}
        resizeMode="cover"
      >
        <StatusBar style="auto" />
        
        {/* ScrollView geral da página */}
        <ScrollView
          style={styles.pageScrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <Header user={user} />
          
          {/* Cards de estatísticas FORA do container branco */}
          <ManagerStatsCard realStats={realStats} />
          
          {/* Container branco - APENAS para busca e WorkOrders */}
          <View style={styles.whiteContainer}>
            <View style={styles.contentSection}>
              <SearchBar
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Buscar OS"
              />
              
              {/* Lista de WorkOrders com scroll interno */}
              <ScrollView
                style={styles.workOrdersScrollContainer}
                contentContainerStyle={styles.workOrdersContent}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.workOrdersContainer}>
                  {filteredWorkOrders.map((workOrder) => (
                    <WorkOrderCard
                      key={workOrder.id}
                      workOrder={workOrder}
                      onPress={() => handleWorkOrderPress(workOrder)}
                      onRefresh={() => handleWorkOrderRefresh(workOrder)}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </ScrollView>
        
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
        />

        <WorkOrderModal
          visible={modalVisible}
          onConfirm={handleModalConfirm}
          onClose={handleModalClose}
          workOrder={selectedWorkOrder}
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
  whiteContainer: {
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
    flex: 1,
  },
  contentSection: {
    paddingHorizontal: 15,
    flex: 1,
  },
  workOrdersContainer: {
    paddingBottom: 10,
  },
  workOrdersScrollContainer: {
    flex: 1,
  },
  workOrdersContent: {
    paddingBottom: 200,
  },
});

export default ManagerScreen; 