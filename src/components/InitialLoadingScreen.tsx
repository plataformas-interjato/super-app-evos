import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { RFValue } from 'react-native-responsive-fontsize';
import { InitialLoadProgress } from '../services/initialDataService';

interface InitialLoadingScreenProps {
  visible: boolean;
  progress: InitialLoadProgress;
  onComplete?: () => void;
}

const { width } = Dimensions.get('window');

export const InitialLoadingScreen: React.FC<InitialLoadingScreenProps> = ({
  visible,
  progress,
  onComplete
}) => {
  const [loadingDots, setLoadingDots] = useState('');

  // Animação dos pontos de loading
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Chamar onComplete quando a carga estiver completa
  useEffect(() => {
    if (progress.completed && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2000); // Aguardar 2 segundos para mostrar a mensagem de sucesso

      return () => clearTimeout(timer);
    }
  }, [progress.completed, onComplete]);

  const getProgressPercentage = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const getStatusText = () => {
    if (progress.error) {
      return '❌ Erro na carga inicial';
    }
    
    if (progress.completed) {
      return '✅ Carga inicial concluída!';
    }
    
    return progress.currentTable || 'Preparando...';
  };

  const getStatusColor = () => {
    if (progress.error) return '#ef4444';
    if (progress.completed) return '#10b981';
    return '#3b82f6';
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Logo ou ícone */}
          <View style={styles.iconContainer}>
            <ActivityIndicator 
              size="large" 
              color={getStatusColor()}
              animating={!progress.completed && !progress.error}
            />
          </View>

          {/* Título */}
          <Text style={styles.title}>
            {progress.completed ? 'Pronto!' : 'Preparando dados...'}
          </Text>

          {/* Status atual */}
          <Text style={[styles.status, { color: getStatusColor() }]}>
            {getStatusText()}{!progress.completed && !progress.error ? loadingDots : ''}
          </Text>

          {/* Barra de progresso */}
          {!progress.completed && !progress.error && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${getProgressPercentage()}%`,
                      backgroundColor: getStatusColor()
                    }
                  ]} 
                />
              </View>
              
              <Text style={styles.progressText}>
                {progress.current} de {progress.total} ({getProgressPercentage()}%)
              </Text>
            </View>
          )}

          {/* Mensagem de erro */}
          {progress.error && (
            <Text style={styles.errorText}>
              {progress.error}
            </Text>
          )}

          {/* Descrição */}
          <Text style={styles.description}>
            {progress.completed 
              ? 'Seus dados estão prontos para uso offline!'
              : progress.error
              ? 'Verifique sua conexão e tente novamente.'
              : 'Esta ação é executada apenas uma vez por conta.'
            }
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 24,
    width: width - 48,
    maxWidth: 400,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  iconContainer: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 50,
  },
  title: {
    fontSize: RFValue(20),
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  status: {
    fontSize: RFValue(14),
    fontWeight: '500',
    marginBottom: 24,
    textAlign: 'center',
    minHeight: RFValue(20),
  },
  progressContainer: {
    width: '100%',
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: RFValue(12),
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  description: {
    fontSize: RFValue(12),
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: RFValue(18),
  },
  errorText: {
    fontSize: RFValue(13),
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
}); 