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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { RFValue } from 'react-native-responsive-fontsize';

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

  // Dados de exemplo seguindo o layout da imagem
  const mockWorkOrders: WorkOrder[] = [
    {
      id: 'ID',
      title: 'Título',
      client: 'Cliente',
      address: 'Endereço',
      priority: 'alta',
      status: 'aguardando',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'ID',
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
    
    // Verificar conexão inicial
    NetInfo.fetch().then(state => {
      setIsConnected(state.isConnected || false);
    });
    
    // Listener para mudanças de conectividade
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected || false);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  const loadWorkOrders = () => {
    setWorkOrders(mockWorkOrders);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      loadWorkOrders();
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

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const filteredWorkOrders = workOrders.filter((workOrder) => {
    const matchesSearch = workOrder.title.toLowerCase().includes(searchText.toLowerCase()) ||
                         workOrder.client.toLowerCase().includes(searchText.toLowerCase()) ||
                         workOrder.id.includes(searchText);
    
    const matchesFilter = activeFilter === 'todas' || workOrder.status === activeFilter;
    
    return matchesSearch && matchesFilter;
  });

  const filters = [
    { key: 'todas' as FilterStatus, label: 'TODAS' },
    { key: 'aguardando' as FilterStatus, label: 'AGUARDANDO' },
    { key: 'em_progresso' as FilterStatus, label: 'EM PROGRESSO' },
  ];

  return (
    <ImageBackground
      source={require('../img-ref/background_home.jpg')}
      style={styles.container}
      resizeMode="cover"
    >
      <StatusBar style="light" />
      
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
            {!isConnected && (
              <View style={styles.connectionStatusInline}>
                <Ionicons name="wifi" size={14} color="#ef4444" />
                <Text style={styles.connectionTextInline}>SEM CONEXÃO</Text>
              </View>
            )}
          </View>
        </View>
        
        {/* Linha divisória - FIXO */}
        <View style={styles.dividerLine} />
        
        {/* Barra de busca - FIXO */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar OS"
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
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter.key && styles.activeFilterText,
                ]}
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
            {filteredWorkOrders.map((workOrder, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.workOrderCard}
                onPress={() => handleWorkOrderPress(workOrder)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardId}>#{workOrder.id}</Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: index === 0 ? '#ef4444' : '#ef4444' }
                  ]}>
                    <Text style={styles.statusText}>
                      {index === 0 ? 'Prioridade' : 'Atrasado'}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="build-outline" size={16} color="#6b7280" />
                  <Text style={styles.infoText}>{workOrder.title}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="person-outline" size={16} color="#6b7280" />
                  <Text style={styles.infoText}>{workOrder.client}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color="#6b7280" />
                  <Text style={styles.infoText}>{workOrder.address}</Text>
                </View>

                <View style={styles.cardFooter}>
                  <TouchableOpacity 
                    style={styles.refreshButton}
                    onPress={() => handleWorkOrderRefresh(workOrder)}
                  >
                    <Ionicons name="refresh" size={20} color="#6b7280" />
                  </TouchableOpacity>
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
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    overflow: 'hidden',
    minWidth: 0,
  },
  activeFilterButton: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    fontSize: RFValue(14),
    fontWeight: 'bold',
    color: '#6b7280',
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
    color: '#374151',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
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
    color: '#6b7280',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  refreshButton: {
    padding: 8,
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
  connectionStatusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  connectionTextInline: {
    marginLeft: 5,
    fontSize: RFValue(12),
    fontWeight: 'bold',
    color: '#ef4444',
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
});

export default MainScreen; 