import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Text,
  ImageBackground,
  SafeAreaView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import ProfileHeader from '../components/ProfileHeader';
import UserStatsCard from '../components/UserStatsCard';
import OSSearchSection from '../components/OSSearchSection';
import OSCard from '../components/OSCard';
import BottomNavigation from '../components/BottomNavigation';

import { User, WorkOrder } from '../types/workOrder';
import { getCachedWorkOrders, filterCachedWorkOrders } from '../services/workOrderCacheService';
import { fetchWorkOrdersWithFilters } from '../services/workOrderService';

interface ProfileScreenProps {
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
}

interface UserStats {
  totalCompletedOS: number;
  ranking: number;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ 
  user, 
  onBackPress, 
  onTabPress 
}) => {
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  const [userStats, setUserStats] = useState<UserStats>({
    totalCompletedOS: 50,
    ranking: 4.5,
  });
  const [isSearching, setIsSearching] = useState(false);
  const [itemsToShow, setItemsToShow] = useState(10);
  
  // Estados para o date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    loadCompletedOS();
    loadUserStats();
  }, []);

  useEffect(() => {
    // Atualizar itens visíveis quando allWorkOrders mudar
    const itemsToDisplay = allWorkOrders.slice(0, itemsToShow);
    setWorkOrders(itemsToDisplay);
  }, [allWorkOrders, itemsToShow]);

  // Detectar quando campos de pesquisa são limpos para recarregar dados
  useEffect(() => {
    if (!searchText.trim() && !searchDate) {
      loadCompletedOS();
      setItemsToShow(10);
    }
  }, [searchText, searchDate]);

  const loadCompletedOS = async () => {
    try {
      const cachedResult = await getCachedWorkOrders(user.id);
      
      if (cachedResult.data && cachedResult.data.length > 0) {
        const completedOS = cachedResult.data.filter(wo => wo.status === 'finalizada');
        const sortedOS = completedOS.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        
        setAllWorkOrders(sortedOS);
      } else {
        try {
          const serverResult = await fetchWorkOrdersWithFilters(
            user.id,
            'finalizada',
            undefined
          );
          
          if (serverResult.data && !serverResult.error) {
            const sortedOS = serverResult.data.sort((a, b) => 
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            
            setAllWorkOrders(sortedOS);
            
            const { cacheWorkOrders } = require('../services/workOrderCacheService');
            await cacheWorkOrders(serverResult.data, user.id);
          } else {
            setAllWorkOrders([]);
          }
        } catch (serverError) {
          setAllWorkOrders([]);
        }
      }
    } catch (error) {
      setAllWorkOrders([]);
    }
  };

  const loadUserStats = async () => {
    try {
      const cachedResult = await getCachedWorkOrders(user.id);
      
      if (cachedResult.data) {
        const completedCount = cachedResult.data.filter(wo => wo.status === 'finalizada').length;
        
        setUserStats({
          totalCompletedOS: completedCount,
          ranking: 4.5,
        });
      }
    } catch (error) {
      // Silently handle error
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim() && !searchDate) {
      // Se não há filtros, recarregar todas as OS finalizadas
      await loadCompletedOS();
      setItemsToShow(10);
      return;
    }

    setIsSearching(true);
    
    try {
      let searchQuery = searchText.trim() || undefined;
      
      const result = await fetchWorkOrdersWithFilters(
        user.id,
        'finalizada',
        searchQuery
      );
      
      if (result.data && !result.error) {
        let filteredData = result.data;
        
        if (searchDate) {
          const [day, month, year] = searchDate.split('/');
          const fullYear = year.length === 2 ? `20${year}` : year;
          const filterDate = new Date(parseInt(fullYear), parseInt(month) - 1, parseInt(day));
          const filterStart = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
          const filterEnd = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate() + 1);
          
          filteredData = filteredData.filter(wo => {
            const woDate = new Date(wo.updatedAt);
            return woDate >= filterStart && woDate < filterEnd;
          });
        }
        
        setAllWorkOrders(filteredData);
        setItemsToShow(10);
      } else {
        Alert.alert('Erro', 'Erro ao realizar busca. Tente novamente.');
      }
    } catch (error) {
      Alert.alert('Erro', 'Erro inesperado ao realizar busca.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadMore = () => {
    setItemsToShow(prev => prev + 10);
  };

  const handleDatePickerPress = () => {
    setShowDatePicker(true);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    
    if (selectedDate) {
      setSelectedDate(selectedDate);
      const day = selectedDate.getDate().toString().padStart(2, '0');
      const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
      const year = selectedDate.getFullYear().toString().slice(-2);
      const formattedDate = `${day}/${month}/${year}`;
      setSearchDate(formattedDate);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setItemsToShow(10);
    
    Promise.all([
      loadCompletedOS(),
      loadUserStats()
    ]).finally(() => {
      setRefreshing(false);
    });
  };

  const handleOSPress = (workOrder: WorkOrder) => {
    Alert.alert(
      'Ordem de Serviço',
      `Abrir OS #${workOrder.id} - ${workOrder.title}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir', onPress: () => console.log('Abrir OS:', workOrder.id) },
      ]
    );
  };

  const handleDownloadOS = (workOrder: WorkOrder) => {
    Alert.alert(
      'Download',
      `Fazer download da OS #${workOrder.id}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Download', onPress: () => console.log('Download OS:', workOrder.id) },
      ]
    );
  };

  const handleTabNavigation = (tab: 'home' | 'profile') => {
    onTabPress(tab);
  };

  // Função para agrupar OS por data
  const groupWorkOrdersByDate = (workOrders: WorkOrder[]) => {
    const grouped = workOrders.reduce((acc, wo) => {
      const dateKey = wo.updatedAt.toDateString();
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(wo);
      return acc;
    }, {} as Record<string, WorkOrder[]>);

    const sortedDates = Object.keys(grouped).sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    );

    return sortedDates.map(dateKey => ({
      date: new Date(dateKey),
      workOrders: grouped[dateKey].sort((a, b) => b.id - a.id)
    }));
  };

  const groupedWorkOrders = groupWorkOrdersByDate(workOrders);
  const hasMoreItems = itemsToShow < allWorkOrders.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require('../img-ref/background_home.jpg')}
        style={styles.container}
        resizeMode="cover"
      >
        <StatusBar style="auto" />
      
        <ProfileHeader user={user} onBackPress={onBackPress} />
      
        <ScrollView
          style={styles.mainScrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <UserStatsCard stats={userStats} />
          
          <View style={styles.dividerLine} />
        
          <OSSearchSection
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchDate={searchDate}
            onSearchDateChange={setSearchDate}
            showAdvancedSearch={showAdvancedSearch}
            onToggleAdvancedSearch={setShowAdvancedSearch}
            onSearch={handleSearch}
            isSearching={isSearching}
            onDatePickerPress={handleDatePickerPress}
          />
          
          <View style={styles.osContainer}>
            {workOrders.length === 0 && !isSearching && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Nenhuma OS finalizada encontrada
                </Text>
                <Text style={styles.emptySubText}>
                  As OS finalizadas aparecerão aqui
                </Text>
              </View>
            )}
            
            {isSearching && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  Buscando...
                </Text>
              </View>
            )}
            
            {workOrders.length > 0 && (
              <>
                {groupedWorkOrders.map((group, groupIndex) => (
                  <View key={group.date.toISOString()}>
                    {group.workOrders.map((workOrder, index) => (
                      <OSCard
                        key={workOrder.id}
                        workOrder={workOrder}
                        onPress={() => handleOSPress(workOrder)}
                        onDownload={() => handleDownloadOS(workOrder)}
                        showDate={index === 0}
                      />
                    ))}
                  </View>
                ))}
                
                {hasMoreItems && (
                  <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                    <Ionicons name="chevron-down" size={20} color="#3b82f6" />
                    <Text style={styles.loadMoreText}>Carregar mais ({allWorkOrders.length - itemsToShow} restantes)</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
          
          <View style={styles.bottomSpacer} />
        </ScrollView>
        
        <BottomNavigation
          activeTab="profile"
          onTabPress={handleTabNavigation}
        />
        
        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
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
  mainScrollContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: -15,
    borderRadius: 15,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    flex: 1,
    overflow: 'hidden',
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 15,
    marginBottom: 15,
  },
  osContainer: {
    paddingBottom: 10,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginHorizontal: 15,
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadMoreText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 100,
  },
});

export default ProfileScreen; 