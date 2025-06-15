import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RFValue } from 'react-native-responsive-fontsize';
import BottomNavigation from '../components/BottomNavigation';
import { User, WorkOrder } from '../types/workOrder';

interface AuditSavingScreenProps {
  workOrder: WorkOrder;
  user: User;
  onTabPress: (tab: 'home' | 'profile') => void;
  onFinishSaving: () => void;
}

const AuditSavingScreen: React.FC<AuditSavingScreenProps> = ({
  workOrder,
  user,
  onTabPress,
  onFinishSaving,
}) => {
  useEffect(() => {
    // Simular processo de salvamento por 3 segundos
    const timer = setTimeout(() => {
      onFinishSaving();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onFinishSaving]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Conteúdo Principal */}
      <View style={styles.content}>
        <Text style={styles.title}>Salvando a auditoria realizada</Text>
        
        {/* Indicador de progresso com pontos */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressDot, styles.activeDot]} />
          <View style={[styles.progressDot, styles.activeDot]} />
          <View style={[styles.progressDot, styles.activeDot]} />
          <View style={[styles.progressDot, styles.activeDot]} />
          <View style={[styles.progressDot, styles.inactiveDot]} />
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
  title: {
    fontSize: RFValue(18),
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 40,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  activeDot: {
    backgroundColor: '#000',
  },
  inactiveDot: {
    backgroundColor: '#d1d5db',
  },
  bottomNavigationContainer: {
    backgroundColor: 'white',
  },
});

export default AuditSavingScreen; 