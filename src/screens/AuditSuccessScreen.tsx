import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import BottomNavigation from '../components/BottomNavigation';
import { User, WorkOrder } from '../types/workOrder';

interface AuditSuccessScreenProps {
  workOrder: WorkOrder;
  user: User;
  onTabPress: (tab: 'home' | 'profile') => void;
  onDownloadReport: () => void;
  onViewWorkOrders: () => void;
}

const AuditSuccessScreen: React.FC<AuditSuccessScreenProps> = ({
  workOrder,
  user,
  onTabPress,
  onDownloadReport,
  onViewWorkOrders,
}) => {
  return (
    <SafeAreaView style={styles.container}>
      {/* Conteúdo Principal */}
      <View style={styles.content}>
        {/* Ícone de Sucesso */}
        <View style={styles.successIconContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#22c55e" />
        </View>
        
        {/* Título */}
        <Text style={styles.title}>Auditoria Salva</Text>
        
        {/* Botões */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.downloadButton]}
            onPress={onDownloadReport}
          >
            <Text style={styles.downloadButtonText}>Baixar Relatório</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.viewOrdersButton]}
            onPress={onViewWorkOrders}
          >
            <Text style={styles.viewOrdersButtonText}>Visualizar ordens de serviço</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigationContainer}>
        <BottomNavigation 
          activeTab="home" 
          onTabPress={onTabPress}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  successIconContainer: {
    marginBottom: 30,
  },
  title: {
    fontSize: RFValue(24),
    fontWeight: 'bold',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 50,
  },
  buttonsContainer: {
    width: '100%',
    gap: 15,
  },
  button: {
    width: '100%',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadButton: {
    backgroundColor: '#fbbf24', // Amarelo
  },
  viewOrdersButton: {
    backgroundColor: '#3b82f6', // Azul
  },
  downloadButtonText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#000',
  },
  viewOrdersButtonText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: 'white',
  },
  bottomNavigationContainer: {
    backgroundColor: 'white',
  },
});

export default AuditSuccessScreen; 