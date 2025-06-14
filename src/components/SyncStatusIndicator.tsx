import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { 
  getOfflineActions, 
  syncAllPendingActions, 
  checkNetworkConnection,
  isSyncInProgress
} from '../services/offlineService';

interface SyncStatusIndicatorProps {
  style?: any;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ style }) => {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkStatus = async () => {
    try {
      // Verificar conexão
      const online = await checkNetworkConnection();
      setIsOnline(online);

      // Verificar se está sincronizando
      const syncing = isSyncInProgress();
      setIsSyncing(syncing);

      // Contar ações pendentes
      const actions = await getOfflineActions();
      const pending = actions.filter(action => !action.synced).length;
      setPendingCount(pending);
    } catch (error) {
      console.error('Erro ao verificar status de sincronização:', error);
    }
  };

  const handleManualSync = async () => {
    if (!isOnline || isSyncing) return;

    console.log('🔄 Sincronização manual solicitada');
    const result = await syncAllPendingActions();
    console.log(`🔄 Sincronização manual: ${result.synced}/${result.total}`);
    
    // Atualizar status após sincronização
    await checkStatus();
  };

  useEffect(() => {
    // Verificar status inicial
    checkStatus();

    // Verificar periodicamente
    const interval = setInterval(checkStatus, 10000); // A cada 10 segundos

    return () => clearInterval(interval);
  }, []);

  // Não mostrar se não há ações pendentes e está online
  if (pendingCount === 0 && isOnline) {
    return null;
  }

  const getStatusColor = () => {
    if (!isOnline) return '#ef4444'; // Vermelho - offline
    if (pendingCount > 0) return '#f59e0b'; // Amarelo - pendente
    return '#10b981'; // Verde - sincronizado
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isSyncing) return 'Sincronizando...';
    if (pendingCount > 0) return `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`;
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