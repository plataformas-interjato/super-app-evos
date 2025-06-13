import React, { useState } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useWorkOrdersWithFilters } from '../hooks/useWorkOrdersCache';
import { CacheStatusIndicator } from './CacheStatusIndicator';
import { WorkOrder, FilterStatus } from '../types/workOrder';

interface WorkOrderListWithCacheProps {
  userId?: string;
  initialStatus?: FilterStatus;
  initialSearch?: string;
}

export const WorkOrderListWithCache: React.FC<WorkOrderListWithCacheProps> = ({
  userId,
  initialStatus = 'todas',
  initialSearch = '',
}) => {
  const [status, setStatus] = useState<FilterStatus>(initialStatus);
  const [search, setSearch] = useState(initialSearch);
  
  const {
    data: workOrders,
    loading,
    error,
    fromCache,
    cacheStats,
    refresh,
    invalidateCache,
    refetch,
  } = useWorkOrdersWithFilters(userId, status, search);

  const handleRefresh = async () => {
    try {
      await refresh();
    } catch (error) {
      Alert.alert('Erro', 'Falha ao atualizar dados');
    }
  };

  const handleInvalidateCache = async () => {
    Alert.alert(
      'Limpar Cache',
      'Deseja limpar o cache local? Isso forçará uma nova busca no servidor.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            try {
              await invalidateCache();
            } catch (error) {
              Alert.alert('Erro', 'Falha ao limpar cache');
            }
          },
        },
      ]
    );
  };

  const renderWorkOrderItem = ({ item }: { item: WorkOrder }) => (
    <View style={styles.workOrderItem}>
      <View style={styles.workOrderHeader}>
        <Text style={styles.workOrderTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, getStatusStyle(item.status)]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>
      
      <Text style={styles.clientText}>Cliente: {item.client}</Text>
      <Text style={styles.addressText}>Endereço: {item.address}</Text>
      
      <View style={styles.workOrderFooter}>
        <View style={[styles.priorityBadge, getPriorityStyle(item.priority)]}>
          <Text style={styles.priorityText}>{getPriorityLabel(item.priority)}</Text>
        </View>
        <Text style={styles.dateText}>
          {item.scheduling_date.toLocaleDateString('pt-BR')}
        </Text>
      </View>
    </View>
  );

  const getStatusStyle = (status: WorkOrder['status']) => {
    switch (status) {
      case 'aguardando':
        return { backgroundColor: '#FEF3C7' };
      case 'em_progresso':
        return { backgroundColor: '#DBEAFE' };
      case 'finalizada':
        return { backgroundColor: '#D1FAE5' };
      case 'cancelada':
        return { backgroundColor: '#FEE2E2' };
      default:
        return { backgroundColor: '#F3F4F6' };
    }
  };

  const getStatusLabel = (status: WorkOrder['status']) => {
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

  const getPriorityStyle = (priority: WorkOrder['priority']) => {
    switch (priority) {
      case 'alta':
        return { backgroundColor: '#FEE2E2' };
      case 'media':
        return { backgroundColor: '#FEF3C7' };
      case 'baixa':
        return { backgroundColor: '#D1FAE5' };
      default:
        return { backgroundColor: '#F3F4F6' };
    }
  };

  const getPriorityLabel = (priority: WorkOrder['priority']) => {
    switch (priority) {
      case 'alta':
        return 'Alta';
      case 'media':
        return 'Média';
      case 'baixa':
        return 'Baixa';
      default:
        return priority;
    }
  };

  return (
    <View style={styles.container}>
      {/* Indicador de Status do Cache */}
      <CacheStatusIndicator
        fromCache={fromCache}
        onRefresh={handleRefresh}
        loading={loading}
      />

      {/* Informações de Debug do Cache */}
      {__DEV__ && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Debug Cache:</Text>
          <Text style={styles.debugText}>
            Cache: {cacheStats.hasCache ? 'Sim' : 'Não'} | 
            Idade: {cacheStats.cacheAge}s | 
            Última Sync: {cacheStats.lastSync}s
          </Text>
          <TouchableOpacity
            style={styles.debugButton}
            onPress={handleInvalidateCache}
          >
            <Text style={styles.debugButtonText}>Limpar Cache</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lista de Work Orders */}
      <FlatList
        data={workOrders}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderWorkOrderItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handleRefresh}
            colors={['#3B82F6']}
            tintColor="#3B82F6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {loading ? (
              <Text style={styles.emptyText}>Carregando work orders...</Text>
            ) : error ? (
              <View>
                <Text style={styles.errorText}>Erro: {error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={refetch}>
                  <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.emptyText}>Nenhuma work order encontrada</Text>
            )}
          </View>
        }
        ListFooterComponent={
          workOrders && workOrders.length > 0 ? (
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                {workOrders.length} work order{workOrders.length !== 1 ? 's' : ''} 
                {fromCache ? ' (cache)' : ' (servidor)'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
  },
  workOrderItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  workOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  workOrderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  clientText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  workOrderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  footerContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
  },
  debugContainer: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 8,
  },
  debugButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  debugButtonText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
  },
}); 