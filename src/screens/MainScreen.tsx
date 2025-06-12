import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import FilterTabs from '../components/FilterTabs';
import WorkOrderCard from '../components/WorkOrderCard';
import BottomNavigation from '../components/BottomNavigation';

import { WorkOrder, User, FilterStatus } from '../types/workOrder';

interface MainScreenProps {
  user: User;
  onTabPress?: (tab: 'home' | 'profile') => void;
}

const MainScreen: React.FC<MainScreenProps> = ({ user, onTabPress }) => {
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('todas');
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Dados de exemplo - em produção, viriam de uma API
  const mockWorkOrders: WorkOrder[] = [
    {
      id: '001',
      title: 'Manutenção preventiva',
      client: 'João Silva',
      address: 'Rua das Flores, 123 - Centro',
      priority: 'alta',
      status: 'aguardando',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '002',
      title: 'Instalação elétrica',
      client: 'Maria Santos',
      address: 'Av. Principal, 456 - Bairro Norte',
      priority: 'media',
      status: 'em_progresso',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '003',
      title: 'Reparo hidráulico',
      client: 'Carlos Oliveira',
      address: 'Rua do Comércio, 789 - Vila Nova',
      priority: 'baixa',
      status: 'todas',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  useEffect(() => {
    loadWorkOrders();
    // Simular verificação de conexão
    checkConnection();
  }, []);

  const loadWorkOrders = () => {
    // Em produção, buscar dados da API
    setWorkOrders(mockWorkOrders);
  };

  const checkConnection = () => {
    // Em produção, verificar conexão real
    setIsConnected(Math.random() > 0.5);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      loadWorkOrders();
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
    if (tab === 'profile') {
      Alert.alert('Perfil', 'Funcionalidade em desenvolvimento');
    }
    if (onTabPress) {
      onTabPress(tab);
    }
  };

  const filteredWorkOrders = workOrders.filter((workOrder) => {
    const matchesSearch = workOrder.title.toLowerCase().includes(searchText.toLowerCase()) ||
                         workOrder.client.toLowerCase().includes(searchText.toLowerCase()) ||
                         workOrder.id.includes(searchText);
    
    const matchesFilter = activeFilter === 'todas' || workOrder.status === activeFilter;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <View style={styles.container}>
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
        <SearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Buscar OS"
        />
        
        <FilterTabs
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
        
        {/* Lista de WorkOrders com scroll interno menor */}
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
      </ScrollView>
      
      <BottomNavigation
        activeTab={activeTab}
        onTabPress={handleTabPress}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  mainScrollContainer: {
    flex: 1,
  },
  workOrdersContainer: {
    paddingBottom: 10,
  },
  bottomSpacer: {
    height: 100,
  },
});

export default MainScreen; 