import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RFValue } from 'react-native-responsive-fontsize';
import { WorkOrder } from '../types/workOrder';

interface AuditSavingScreenProps {
  workOrder: WorkOrder;
  onFinishSaving: () => void;
}

const AuditSavingScreen: React.FC<AuditSavingScreenProps> = ({
  workOrder,
  onFinishSaving,
}) => {
  const animationValues = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('🔄 AuditSavingScreen useEffect iniciado');
    
    // Limpar timer anterior se existir (proteção contra múltiplas execuções)
    if (timerRef.current) {
      console.log('⚠️ Limpando timer anterior');
      clearTimeout(timerRef.current);
    }
    
    // Simular processo de salvamento por 3 segundos
    timerRef.current = setTimeout(() => {
      console.log('✅ Timer de 3s concluído, chamando onFinishSaving');
      onFinishSaving();
    }, 3000);

    // Iniciar animação dos pontos
    const startAnimation = () => {
      console.log('🎬 Iniciando animação dos pontos');
      const animations = animationValues.map((value, index) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 600,
              delay: index * 200,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0.3,
              duration: 600,
              useNativeDriver: true,
            }),
          ])
        );
      });

      Animated.stagger(100, animations).start();
    };

    startAnimation();

    // Cleanup na desmontagem
    return () => {
      console.log('🧹 AuditSavingScreen cleanup - removendo timer');
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [onFinishSaving]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Conteúdo Principal */}
      <View style={styles.content}>
        <Text style={styles.title}>Salvando a auditoria realizada</Text>
        
        {/* Indicador de progresso com pontos animados */}
        <View style={styles.progressContainer}>
          {animationValues.map((animValue, index) => (
            <Animated.View
              key={index}
              style={[
                styles.progressDot,
                {
                  opacity: animValue,
                  transform: [
                    {
                      scale: animValue.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [0.8, 1.2],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
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
    gap: 12,
  },
  progressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
});

export default AuditSavingScreen; 