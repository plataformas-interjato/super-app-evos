import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import Header from '../components/Header';
import ManagerStatsCard from '../components/ManagerStatsCard';
import SearchBar from '../components/SearchBar';
import WorkOrderCard from '../components/WorkOrderCard';
import BottomNavigation from '../components/BottomNavigation';

import { WorkOrder, User } from '../types/workOrder';
import { ManagerStats } from '../types/manager';

interface ManagerScreenProps {
  user: User;
  onTabPress?: (tab: 'home' | 'profile') => void;
}

const ManagerScreen: React.FC<ManagerScreenProps> = ({ user, onTabPress }) => {
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [managerStats, setManagerStats] = useState<ManagerStats>({
    totalEvaluated: 0,
    ranking: 0.0,
    executed: { count: 0, percentage: 39 },
    delayed: { count: 0, percentage: 41 },
    pending: { count: 0, percentage: 20 },
    lastUpdate: '',
  });

  // Dados de exemplo - em produção, viriam de uma API
  const mockWorkOrders: WorkOrder[] = [
    {
      id: '001',
      title: 'Título',
      client: 'Cliente',
      address: 'Endereço',
      priority: 'alta',
      status: 'aguardando',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '002',
      title: 'Título',
      client: 'Cliente',
      address: 'Endereço',
      priority: 'media',
      status: 'em_progresso',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  useEffect(() => {
    loadWorkOrders();
    loadManagerStats();
    checkConnection();
  }, []);

  const loadWorkOrders = () => {
    // Em produção, buscar dados da API
    setWorkOrders(mockWorkOrders);
  };

  const loadManagerStats = () => {
    // Em produção, buscar estatísticas da API
    const currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
    
    setManagerStats({
      totalEvaluated: 150,
      ranking: 0.0,
      executed: { count: 0, percentage: 39 },
      delayed: { count: 0, percentage: 41 },
      pending: { count: 0, percentage: 20 },
      lastUpdate: `${currentDate}`,
    });
  };

  const checkConnection = () => {
    // Em produção, verificar conexão real
    setIsConnected(false); // Mostra "SEM CONEXÃO" como na imagem
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      loadWorkOrders();
      loadManagerStats();
      checkConnection();
      setRefreshing(false);
    }, 1500);
  };

  const handleWorkOrderPress = (workOrder: WorkOrder) => {
    Alert.alert(
      'Ordem de Serviço',
      `Abrir OS #${workOrder.id} - ${workOrder.title}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir', onPress: () => console.log('Abrir OS:', workOrder.id) },
      ]
    );
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
                         workOrder.id.includes(searchText);
    
    return matchesSearch;
  });

  return (
    <LinearGradient
      colors={['#1e3a8a', '#3b82f6']}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <StatusBar style="light" />
      
      <Header user={user} isConnected={isConnected} />
      
      {/* ScrollView principal da tela */}
      <ScrollView
        style={styles.mainScrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <ManagerStatsCard stats={managerStats} />
        
        {/* Seção inferior com fundo branco */}
        <View style={styles.bottomSection}>
          <SearchBar
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar OS"
          />
          
          {/* Lista de WorkOrders */}
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
          
          {/* Espaço extra no final para evitar que o último item fique atrás da navegação */}
          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
      
      <BottomNavigation
        activeTab={activeTab}
        onTabPress={handleTabPress}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainScrollContainer: {
    flex: 1,
  },
  bottomSection: {
    backgroundColor: '#f3f4f6',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    minHeight: 400, // Altura mínima para garantir que a seção seja visível
  },
  workOrdersContainer: {
    paddingBottom: 10,
  },
  bottomSpacer: {
    height: 100,
  },
});

export default ManagerScreen; 