import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCacheStats } from '../hooks/useWorkOrdersCache';

interface CacheStatusIndicatorProps {
  fromCache?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
}

export const CacheStatusIndicator: React.FC<CacheStatusIndicatorProps> = ({
  fromCache = false,
  onRefresh,
  loading = false
}) => {
  const { stats } = useCacheStats();

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const getCacheStatusColor = (): string => {
    if (!stats.hasCache) return '#6B7280'; // Cinza - sem cache
    if (fromCache && stats.cacheAge < 300) return '#10B981'; // Verde - cache recente
    if (fromCache && stats.cacheAge < 900) return '#F59E0B'; // Amarelo - cache médio
    return '#EF4444'; // Vermelho - cache antigo ou servidor
  };

  const getCacheStatusText = (): string => {
    if (loading) return 'Carregando...';
    if (!stats.hasCache) return 'Sem cache';
    if (fromCache) return `Cache (${formatTime(stats.cacheAge)})`;
    return 'Servidor';
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <View style={[styles.indicator, { backgroundColor: getCacheStatusColor() }]} />
        <Text style={styles.statusText}>
          {getCacheStatusText()}
        </Text>
      </View>
      
      {stats.hasCache && (
        <Text style={styles.syncText}>
          Última sync: {formatTime(stats.lastSync)}
        </Text>
      )}
      
      {onRefresh && (
        <TouchableOpacity
          style={[styles.refreshButton, loading && styles.refreshButtonDisabled]}
          onPress={onRefresh}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>
            {loading ? 'Atualizando...' : '🔄 Atualizar'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  syncText: {
    fontSize: 10,
    color: '#6B7280',
    marginHorizontal: 12,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 6,
  },
  refreshButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
}); 