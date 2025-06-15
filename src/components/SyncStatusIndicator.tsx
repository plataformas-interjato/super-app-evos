import React, { useState, useEffect } from 'react';
import { Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { 
  getOfflineActions, 
  syncAllPendingActions, 
  checkNetworkConnection,
  isSyncInProgress,
  getSyncStats,
  forceStopSync,
  clearFailedActions,
  retryFailedActions,
  clearAllOfflineActions,
  getRemainingActionsCount
} from '../services/offlineService';

interface SyncStatusIndicatorProps {
  style?: any;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ style }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState({ total: 0, pending: 0, synced: 0, failed: 0 });

  const checkStatus = async () => {
    try {
      // Verificar conexão
      const online = await checkNetworkConnection();
      setIsOnline(online);

      // Verificar se está sincronizando
      const syncing = isSyncInProgress();
      setIsSyncing(syncing);

      // Obter estatísticas detalhadas
      const stats = await getSyncStats();
      setSyncStats(stats);
      setPendingCount(stats.pending);
    } catch (error) {
      console.error('Erro ao verificar status de sincronização:', error);
    }
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      Alert.alert('Sem Conexão', 'Conecte-se à internet para sincronizar.');
      return;
    }

    if (isSyncing) {
      Alert.alert(
        'Sincronização em Andamento',
        'Uma sincronização já está em progresso. Deseja forçar a parada?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Forçar Parada', 
            style: 'destructive',
            onPress: () => {
              forceStopSync();
              checkStatus();
            }
          }
        ]
      );
      return;
    }

    // Se há falhas, mostrar opções especiais
    if (syncStats.failed > 0) {
      Alert.alert(
        'Ações com Falha',
        `${syncStats.failed} ações falharam na sincronização. O que deseja fazer?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Tentar Novamente', 
            onPress: async () => {
              await retryFailedActions();
              await checkStatus();
              // Tentar sincronizar novamente
              const result = await syncAllPendingActions();
              if (result.total > 0) {
                Alert.alert(
                  'Sincronização Concluída',
                  `${result.synced} ações sincronizadas.\n${result.failed} falharam.`
                );
              }
              await checkStatus();
            }
          },
          { 
            text: 'Remover Falhas', 
            style: 'destructive',
            onPress: async () => {
              await clearFailedActions();
              await checkStatus();
              Alert.alert('Concluído', 'Ações que falharam foram removidas.');
            }
          }
        ]
      );
      return;
    }

    if (pendingCount === 0) {
      // Se não há pendentes nem falhas, oferecer limpeza completa
      Alert.alert(
        'Sincronizado', 
        'Não há ações pendentes. Deseja limpar o cache de sincronização?',
        [
          { text: 'Não', style: 'cancel' },
          { 
            text: 'Limpar Cache', 
            onPress: async () => {
              await clearAllOfflineActions();
              await checkStatus();
              Alert.alert('Concluído', 'Cache de sincronização limpo.');
            }
          }
        ]
      );
      return;
    }

    console.log('🔄 Sincronização manual solicitada');
    const result = await syncAllPendingActions();
    console.log(`🔄 Sincronização manual: ${result.synced}/${result.total}`);
    
    // Mostrar resultado
    if (result.total > 0) {
      Alert.alert(
        'Sincronização Concluída',
        `${result.synced} ações sincronizadas com sucesso.\n${result.failed} falharam.`
      );
    }
    
    // Atualizar status após sincronização
    await checkStatus();
  };

  useEffect(() => {
    // Verificar status inicial
    checkStatus();

    // Verificar periodicamente
    const interval = setInterval(checkStatus, 5000); // Reduzido para 5 segundos para ser mais responsivo

    return () => clearInterval(interval);
  }, []);

  // Escutar mudanças nas ações offline para atualizar em tempo real
  useEffect(() => {
    const checkForChanges = async () => {
      // Verificar se há mudanças nas ações offline
      const currentStats = await getSyncStats();
      
      // Se as estatísticas mudaram, atualizar o status
      if (
        currentStats.pending !== syncStats.pending ||
        currentStats.failed !== syncStats.failed ||
        currentStats.total !== syncStats.total
      ) {
        console.log('📊 Mudança detectada nas ações offline, atualizando SyncStatusIndicator');
        await checkStatus();
      }
    };

    // Verificar mudanças a cada 2 segundos
    const changeInterval = setInterval(checkForChanges, 2000);

    return () => clearInterval(changeInterval);
  }, [syncStats]);

  // Não mostrar se não há ações pendentes e está online
  if (pendingCount === 0 && isOnline && syncStats.failed === 0) {
    return null;
  }

  const getStatusColor = () => {
    if (!isOnline) return '#ef4444'; // Vermelho - offline
    if (isSyncing) return '#3b82f6'; // Azul - sincronizando
    if (pendingCount > 0) return '#f59e0b'; // Amarelo - pendente
    if (syncStats.failed > 0) return '#ef4444'; // Vermelho - falhas
    return '#10b981'; // Verde - sincronizado
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isSyncing) {
      const remaining = getRemainingActionsCount();
      return `Sincronizando... (${remaining} restantes)`;
    }
    if (pendingCount > 0) return `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`;
    if (syncStats.failed > 0) return `${syncStats.failed} falharam`;
    return 'Sincronizado';
  };

  const getStatusIcon = () => {
    if (!isOnline) return 'cloud-offline-outline';
    if (isSyncing) return 'sync-outline';
    if (pendingCount > 0) return 'cloud-upload-outline';
    return 'cloud-done-outline';
  };

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: getStatusColor() }, style]}
      onPress={handleManualSync}
      disabled={!isOnline || isSyncing}
      activeOpacity={0.7}
    >
      <Ionicons 
        name={getStatusIcon()} 
        size={16} 
        color="white" 
        style={isSyncing ? styles.spinning : undefined}
      />
      <Text style={styles.text}>{getStatusText()}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  text: {
    color: 'white',
    fontSize: RFValue(12),
    fontWeight: '600',
    marginLeft: 6,
  },
  spinning: {
    // Animação de rotação seria implementada com Animated API se necessário
  },
});

export default SyncStatusIndicator; 