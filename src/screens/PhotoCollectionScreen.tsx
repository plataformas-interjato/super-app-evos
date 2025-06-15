import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import * as ImagePicker from 'expo-image-picker';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';
import { ServiceStep, ServiceStepData, getServiceStepsWithDataCached } from '../services/serviceStepsService';
import { hasFinalPhoto } from '../services/auditService';

const { width } = Dimensions.get('window');

interface PhotoCollectionScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onFinishPhotoCollection: (photos: { [entryId: number]: string }) => void;
  onBackToServiceSteps?: () => void;
}

interface PhotoEntry {
  id: number;
  titulo: string;
  stepTitle: string;
  stepId: number;
  photoUri?: string;
}

const PhotoCollectionScreen: React.FC<PhotoCollectionScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onFinishPhotoCollection,
  onBackToServiceSteps,
}) => {
  const [steps, setSteps] = useState<ServiceStep[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [collectedPhotos, setCollectedPhotos] = useState<{ [entryId: number]: string }>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadServiceSteps();
  }, []);

  const loadServiceSteps = async () => {
    setIsLoading(true);
    try {
      if (!workOrder.tipo_os_id) {
        console.warn('⚠️ Nenhum tipo_os_id disponível');
        setSteps([]);
        return;
      }

      const { data: stepsFromCache, error, fromCache } = await getServiceStepsWithDataCached(
        workOrder.tipo_os_id, 
        workOrder.id
      );
      
      if (stepsFromCache && !error && stepsFromCache.length > 0) {
        setSteps(stepsFromCache);
        
        // Criar lista de entradas para fotos
        const entries: PhotoEntry[] = [];
        stepsFromCache.forEach(step => {
          step.entradas?.forEach(entry => {
            entries.push({
              id: entry.id,
              titulo: entry.valor || `Entrada ${entry.ordem_entrada}`,
              stepTitle: step.titulo,
              stepId: step.id,
            });
          });
        });
        
        setPhotoEntries(entries);
        console.log(`📸 ${entries.length} entradas de foto carregadas`);
      } else {
        console.warn('⚠️ Nenhuma etapa encontrada:', error);
        setSteps([]);
        setPhotoEntries([]);
      }
    } catch (error) {
      console.error('💥 Erro ao carregar etapas:', error);
      setSteps([]);
      setPhotoEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentStepEntries = (): PhotoEntry[] => {
    if (steps.length === 0 || activeStepIndex >= steps.length) return [];
    
    const currentStep = steps[activeStepIndex];
    return photoEntries.filter(entry => entry.stepId === currentStep.id);
  };

  const takePhoto = async (entryId: number) => {
    // Solicitar permissão da câmera
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permissão Necessária',
        'É necessário permitir o acesso à câmera para tirar fotos.'
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        const photoUri = result.assets[0].uri;
        setCollectedPhotos(prev => ({
          ...prev,
          [entryId]: photoUri
        }));
        
        console.log(`📸 Foto capturada para entrada ${entryId}`);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
      console.error('Erro ao tirar foto:', error);
    }
  };

  const removePhoto = (entryId: number) => {
    setCollectedPhotos(prev => {
      const updated = { ...prev };
      delete updated[entryId];
      return updated;
    });
  };

  // Função de back personalizada que considera se já existe foto final
  const handleBackPress = async () => {
    try {
      // Verificar se já existe foto final
      const { hasPhoto, error } = await hasFinalPhoto(workOrder.id);
      
      if (error) {
        console.warn('⚠️ Erro ao verificar foto final, voltando normalmente:', error);
        // Em caso de erro, voltar normalmente
        onBackPress();
        return;
      }

      if (hasPhoto && onBackToServiceSteps) {
        console.log('✅ Foto final existe, voltando para etapas/entradas');
        // Se tem foto final e a função foi fornecida, voltar para etapas/entradas
        onBackToServiceSteps();
      } else {
        console.log('📱 Sem foto final ou função não fornecida, voltando normalmente');
        // Se não tem foto final ou função não foi fornecida, voltar normalmente
        onBackPress();
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao verificar foto final:', error);
      // Em caso de erro, voltar normalmente
      onBackPress();
    }
  };

  const handleNext = () => {
    if (activeStepIndex < steps.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
    }
  };

  const handleFinish = () => {
    const totalEntries = photoEntries.length;
    const photosCollected = Object.keys(collectedPhotos).length;
    
    if (photosCollected === 0) {
      Alert.alert(
        'Fotos Obrigatórias',
        'É necessário tirar pelo menos uma foto para continuar.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Continuar para Finalização',
      `Você coletou ${photosCollected} de ${totalEntries} fotos possíveis.\n\nDeseja continuar para a finalização da ordem de serviço?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Continuar', 
          onPress: () => onFinishPhotoCollection(collectedPhotos)
        }
      ]
    );
  };

  const renderPhotoCard = (entry: PhotoEntry) => {
    const hasPhoto = collectedPhotos[entry.id];
    
    return (
      <View key={entry.id} style={styles.photoCard}>
        <Text style={styles.photoCardTitle}>{entry.titulo}</Text>
        
        <TouchableOpacity
          style={[styles.photoArea, hasPhoto && styles.photoAreaWithImage]}
          onPress={() => takePhoto(entry.id)}
        >
          {hasPhoto ? (
            <Image source={{ uri: hasPhoto }} style={styles.photoImage} />
          ) : (
            <Ionicons name="camera" size={40} color="#9ca3af" />
          )}
        </TouchableOpacity>
        
        {hasPhoto && (
          <TouchableOpacity
            style={styles.removePhotoButton}
            onPress={() => removePhoto(entry.id)}
          >
            <Ionicons name="trash" size={16} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Carregando etapas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentStepEntries = getCurrentStepEntries();
  const currentStep = steps[activeStepIndex];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Auditoria pós-serviço</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Progress Steps */}
      <View style={styles.progressContainer}>
        {steps.map((step, index) => (
          <TouchableOpacity
            key={step.id}
            style={[
              styles.progressStep,
              index === activeStepIndex && styles.activeProgressStep,
              index < activeStepIndex && styles.completedProgressStep,
            ]}
            onPress={() => setActiveStepIndex(index)}
          >
            <View style={[
              styles.progressStepCircle,
              index === activeStepIndex && styles.activeProgressStepCircle,
              index < activeStepIndex && styles.completedProgressStepCircle,
            ]}>
              <Text style={[
                styles.progressStepNumber,
                index === activeStepIndex && styles.activeProgressStepNumber,
                index < activeStepIndex && styles.completedProgressStepNumber,
              ]}>
                {index + 1}
              </Text>
            </View>
            {index < steps.length - 1 && (
              <View style={[
                styles.progressLine,
                index < activeStepIndex && styles.completedProgressLine,
              ]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Current Step Title */}
      {currentStep && (
        <View style={styles.stepTitleContainer}>
          <Text style={styles.stepTitle}>{currentStep.titulo}</Text>
        </View>
      )}

      {/* Photo Grid */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.photoGrid}>
          {currentStepEntries.map(entry => renderPhotoCard(entry))}
        </View>
        
        {currentStepEntries.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhuma entrada de foto para esta etapa</Text>
          </View>
        )}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={[styles.navButton, styles.previousButton]}
          onPress={handleBackPress}
        >
          <Text style={styles.navButtonText}>
            Voltar
          </Text>
        </TouchableOpacity>

        {activeStepIndex === steps.length - 1 ? (
          <TouchableOpacity
            style={[styles.navButton, styles.finishButton]}
            onPress={handleFinish}
          >
            <Text style={styles.finishButtonText}>Próximo</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.navButton, styles.nextButton]}
            onPress={handleNext}
          >
            <Text style={styles.nextButtonText}>Próximo</Text>
          </TouchableOpacity>
        )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#000',
  },
  headerRight: {
    width: 34,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'white',
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  activeProgressStep: {
    // Estilo para step ativo (pode ser vazio se não precisar de estilo específico)
  },
  completedProgressStep: {
    // Estilo para step completado (pode ser vazio se não precisar de estilo específico)
  },
  progressStepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeProgressStepCircle: {
    backgroundColor: '#3b82f6',
  },
  completedProgressStepCircle: {
    backgroundColor: '#10b981',
  },
  progressStepNumber: {
    fontSize: RFValue(12),
    fontWeight: 'bold',
    color: '#6b7280',
  },
  activeProgressStepNumber: {
    color: 'white',
  },
  completedProgressStepNumber: {
    color: 'white',
  },
  progressLine: {
    position: 'absolute',
    top: 15,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: '#e5e7eb',
    zIndex: -1,
  },
  completedProgressLine: {
    backgroundColor: '#10b981',
  },
  stepTitleContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stepTitle: {
    fontSize: RFValue(16),
    fontWeight: 'bold',
    color: '#374151',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  photoCard: {
    width: (width - 60) / 2,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  photoCardTitle: {
    fontSize: RFValue(12),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
    textAlign: 'center',
  },
  photoArea: {
    width: '100%',
    height: 120,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAreaWithImage: {
    borderStyle: 'solid',
    borderColor: '#10b981',
    backgroundColor: 'transparent',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'white',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: RFValue(14),
    color: '#6b7280',
    textAlign: 'center',
  },
  navigationContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 10,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousButton: {
    backgroundColor: '#f3f4f6',
  },
  nextButton: {
    backgroundColor: '#22c55e',
  },
  finishButton: {
    backgroundColor: '#3b82f6',
  },
  navButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#374151',
  },
  nextButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: 'white',
  },
  finishButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: 'white',
  },
  bottomNavigationContainer: {
    backgroundColor: 'white',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: RFValue(16),
    color: '#6b7280',
  },
});

export default PhotoCollectionScreen; 