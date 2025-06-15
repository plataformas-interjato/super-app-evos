import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import * as ImagePicker from 'expo-image-picker';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';
import { ServiceStep, ServiceStepData, getServiceStepsWithDataCached, saveDadosRecord } from '../services/serviceStepsService';
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
  fotoModelo?: string; // Foto modelo do banco de dados
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
  const [showModelPhotoModal, setShowModelPhotoModal] = useState(false);
  const [selectedEntryForModel, setSelectedEntryForModel] = useState<PhotoEntry | null>(null);
  const stageScrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadServiceSteps();
  }, []);

  // Centralizar o step ativo quando mudar
  useEffect(() => {
    if (steps.length > 0 && stageScrollViewRef.current) {
      centerCurrentStage();
    }
  }, [activeStepIndex, steps.length]);

  // Função para centralizar a etapa atual
  const centerCurrentStage = () => {
    if (steps.length > 0 && stageScrollViewRef.current) {
      const scrollToIndex = activeStepIndex;
      const buttonWidth = 200; // Largura do botão centralizado
      const buttonMargin = 20; // Espaçamento entre botões
      const containerWidth = width;
      
      // Calcular posição para centralizar o botão ativo exatamente no centro da tela
      const scrollToX = (scrollToIndex * (buttonWidth + buttonMargin)) - (containerWidth / 2) + (buttonWidth / 2);
      
      setTimeout(() => {
        stageScrollViewRef.current?.scrollTo({
          x: Math.max(0, scrollToX),
          animated: true,
        });
      }, 150);
    }
  };

  const loadServiceSteps = async () => {
    setIsLoading(true);
    try {
      if (!workOrder.tipo_os_id) {
        console.warn('⚠️ Nenhum tipo_os_id disponível');
        setSteps([]);
        return;
      }

      console.log('🔍 Carregando etapas para tipo_os_id:', workOrder.tipo_os_id);
      const { data: stepsFromCache, error, fromCache } = await getServiceStepsWithDataCached(
        workOrder.tipo_os_id, 
        workOrder.id
      );
      
      console.log('📋 Dados carregados:', {
        hasData: !!stepsFromCache,
        error,
        fromCache,
        stepsCount: stepsFromCache?.length || 0
      });
      
      if (stepsFromCache && !error && stepsFromCache.length > 0) {
        setSteps(stepsFromCache);
        
        // Debug: verificar estrutura dos dados
        stepsFromCache.forEach((step, index) => {
          console.log(`📌 Etapa ${index + 1}:`, {
            id: step.id,
            titulo: step.titulo,
            entradasCount: step.entradas?.length || 0
          });
          
          step.entradas?.forEach((entry, entryIndex) => {
            console.log(`   📝 Entrada ${entryIndex + 1}:`, {
              id: entry.id,
              valor: entry.valor,
              ordem_entrada: entry.ordem_entrada
            });
          });
        });
        
        // Criar lista de entradas para fotos
        const entries: PhotoEntry[] = [];
        stepsFromCache.forEach(step => {
          step.entradas?.forEach(entry => {
            const titulo = entry.titulo || entry.valor || `Entrada ${entry.ordem_entrada}`;
            console.log(`📸 Criando entrada de foto:`, {
              id: entry.id,
              titulo,
              stepTitle: step.titulo,
              originalTitulo: entry.titulo,
              originalValor: entry.valor,
              fotoModelo: entry.foto_modelo ? 'Possui foto modelo' : 'Sem foto modelo'
            });
            
            entries.push({
              id: entry.id,
              titulo,
              stepTitle: step.titulo,
              stepId: step.id,
              fotoModelo: entry.foto_modelo,
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

  // Função para formatar foto modelo (base64 ou URL)
  const formatPhotoUri = (fotoModelo: string): string => {
    if (!fotoModelo) return '';
    
    // Se já tem o prefixo data:image, retorna como está
    if (fotoModelo.startsWith('data:image/')) {
      return fotoModelo;
    }
    
    // Se parece ser base64 (não tem http/https), adiciona o prefixo
    if (!fotoModelo.startsWith('http')) {
      return `data:image/jpeg;base64,${fotoModelo}`;
    }
    
    // Se é uma URL, retorna como está
    return fotoModelo;
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

  const openModelPhotoModal = (entry: PhotoEntry) => {
    setSelectedEntryForModel(entry);
    setShowModelPhotoModal(true);
  };

  const closeModelPhotoModal = () => {
    setShowModelPhotoModal(false);
    setSelectedEntryForModel(null);
  };

  const takePhotoFromModal = async () => {
    if (!selectedEntryForModel) return;
    
    // Fechar modal primeiro
    closeModelPhotoModal();
    
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
        
        // Salvar na tabela dados
        console.log('💾 Salvando foto na tabela dados...');
        const { data, error } = await saveDadosRecord(
          workOrder.id,
          selectedEntryForModel.id,
          photoUri
        );

        if (error) {
          Alert.alert('Erro', `Não foi possível salvar a foto: ${error}`);
          console.error('❌ Erro ao salvar foto na tabela dados:', error);
          return;
        }

        // Se salvou com sucesso, também adicionar ao estado local para exibição
        console.log(`💾 Adicionando foto ao estado local para entrada ${selectedEntryForModel.id}`);
        setCollectedPhotos(prev => {
          const newState = {
            ...prev,
            [selectedEntryForModel.id]: photoUri
          };
          console.log(`📊 Estado atualizado:`, {
            entradaId: selectedEntryForModel.id,
            photoUri: photoUri.substring(0, 30) + '...',
            estadoAnterior: Object.keys(prev),
            estadoNovo: Object.keys(newState)
          });
          return newState;
        });
        
        console.log(`✅ Foto capturada e salva na tabela dados para entrada ${selectedEntryForModel.id}`);
        console.log('📊 Dados salvos:', data);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
      console.error('💥 Erro ao tirar foto:', error);
    }
  };

  const removePhoto = (entryId: number) => {
    setCollectedPhotos(prev => {
      const updated = { ...prev };
      delete updated[entryId];
      return updated;
    });
  };

  // Função de back personalizada que considera a etapa atual
  const handleBackPress = async () => {
    // Se não estiver na primeira etapa, voltar para a etapa anterior
    if (activeStepIndex > 0) {
      console.log(`📱 Voltando da etapa ${activeStepIndex + 1} para etapa ${activeStepIndex}`);
      setActiveStepIndex(activeStepIndex - 1);
      return;
    }

    // Se estiver na primeira etapa (índice 0), voltar para a tela anterior (checklist)
    try {
      console.log('📱 Na primeira etapa, verificando se deve voltar para checklist...');
      
      // Verificar se já existe foto final
      const { hasPhoto, error } = await hasFinalPhoto(workOrder.id);
      
      if (error) {
        console.warn('⚠️ Erro ao verificar foto final, voltando normalmente:', error);
        // Em caso de erro, voltar normalmente
        onBackPress();
        return;
      }

      if (hasPhoto && onBackToServiceSteps) {
        console.log('✅ Foto final existe, voltando para etapas/checklist');
        // Se tem foto final e a função foi fornecida, voltar para etapas/checklist
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

  const handleStepPress = (index: number) => {
    setActiveStepIndex(index);
  };

  const renderPhotoCard = (entry: PhotoEntry) => {
    const hasPhoto = collectedPhotos[entry.id];
    const hasFotoModelo = entry.fotoModelo;
    
    // Debug log para verificar prioridade das fotos
    console.log(`🔍 Renderizando card para entrada ${entry.id}:`, {
      titulo: entry.titulo,
      hasPhoto: !!hasPhoto,
      hasFotoModelo: !!hasFotoModelo,
      photoUri: hasPhoto ? hasPhoto.substring(0, 30) + '...' : 'Nenhuma'
    });
    
    // Debug log para foto modelo
    if (hasFotoModelo) {
      console.log(`📸 Foto modelo para entrada ${entry.id}:`, {
        titulo: entry.titulo,
        fotoModeloLength: hasFotoModelo.length,
        isBase64: !hasFotoModelo.startsWith('http'),
        preview: hasFotoModelo.substring(0, 50) + '...'
      });
    }
    
    return (
      <View key={entry.id} style={styles.photoCard}>
        <Text style={styles.photoCardTitle}>{entry.titulo}</Text>
        
        <View style={styles.photoContainer}>
          <TouchableOpacity
            style={[
              styles.photoArea, 
              hasPhoto && styles.photoAreaWithCapturedImage, // Verde para foto capturada
              !hasPhoto && hasFotoModelo && styles.photoAreaWithModelImage // Vermelha para foto modelo
            ]}
            onPress={() => {
              // Se tem foto capturada, sempre abrir câmera para nova captura
              if (hasPhoto) {
                console.log(`📷 Foto já capturada - abrindo câmera para nova captura (entrada ${entry.id})`);
                takePhoto(entry.id);
              }
              // Se tem foto modelo mas não tem foto capturada, abrir modal da foto modelo
              else if (hasFotoModelo) {
                console.log(`🖼️ Abrindo modal da foto modelo (entrada ${entry.id})`);
                openModelPhotoModal(entry);
              }
              // Se não tem nenhuma, abrir câmera diretamente
              else {
                console.log(`📷 Abrindo câmera diretamente (entrada ${entry.id})`);
                takePhoto(entry.id);
              }
            }}
          >
            {hasPhoto ? (
              // PRIORIDADE: Se tem foto capturada, exibe ela
              <Image source={{ uri: hasPhoto }} style={styles.photoImage} />
            ) : hasFotoModelo ? (
              // SEGUNDA OPÇÃO: Se não tem foto capturada mas tem foto modelo, exibe a foto modelo
              <Image 
                source={{ uri: formatPhotoUri(hasFotoModelo) }} 
                style={styles.photoImage}
                onError={(error) => {
                  console.error(`❌ Erro ao carregar foto modelo para entrada ${entry.id}:`, error);
                }}
                onLoad={() => {
                  console.log(`✅ Foto modelo carregada para entrada ${entry.id}`);
                }}
              />
            ) : (
              // TERCEIRA OPÇÃO: Se não tem nenhuma das duas, exibe o ícone da câmera
              <Ionicons name="camera" size={40} color="#000000" />
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
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Auditoria pós-serviço</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Stage Navigation Menu */}
      <View style={styles.stageNavigationContainer}>
        {/* Indicadores de navegação */}
        <View style={styles.navigationIndicators}>
          {/* Indicador esquerda - parte translúcida do botão anterior */}
          <View style={styles.leftIndicator}>
            {activeStepIndex > 0 && (
              <View style={styles.translucentButtonContainer}>
                <View style={styles.translucentButtonPart}>
                  <Text 
                    style={styles.translucentButtonText}
                    numberOfLines={2}
                  >
                    {(steps[activeStepIndex - 1]?.titulo || '').substring(0, 12)}
                  </Text>
                </View>
                {/* Linha verde para etapa concluída */}
                <View style={styles.completedIndicatorLine} />
              </View>
            )}
          </View>

          {/* Botão central */}
          <View style={styles.centerButtonContainer}>
            <View style={styles.centerButtonWrapper}>
              <TouchableOpacity
                style={[
                  styles.centerStageButton,
                  styles.activeStageButton,
                ]}
                onPress={() => handleStepPress(activeStepIndex)}
              >
                <Text 
                  style={[
                    styles.centerStageButtonText,
                    styles.activeStageButtonText,
                  ]}
                >
                  {steps[activeStepIndex]?.titulo || ''}
                </Text>
              </TouchableOpacity>
              {/* Linha verde para etapa atual (em progresso) */}
              <View style={styles.currentIndicatorLine} />
            </View>
          </View>

          {/* Indicador direita - parte translúcida do botão próximo */}
          <View style={styles.rightIndicator}>
            {activeStepIndex < steps.length - 1 && (
              <View style={styles.translucentButtonContainer}>
                <View style={styles.translucentButtonPart}>
                  <Text 
                    style={styles.translucentButtonText}
                    numberOfLines={2}
                  >
                    {(steps[activeStepIndex + 1]?.titulo || '').substring(0, 12)}
                  </Text>
                </View>
                {/* Linha cinza para etapa pendente */}
                <View style={styles.pendingIndicatorLine} />
              </View>
            )}
          </View>
        </View>
      </View>

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

      {/* Modal de Foto Modelo em Tela Cheia */}
      <Modal
        visible={showModelPhotoModal}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={closeModelPhotoModal}
      >
        <View style={styles.modalContainer}>
          {/* Header do Modal */}
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeModelPhotoModal}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Foto Modelo */}
          <View style={styles.modalImageContainer}>
            {selectedEntryForModel?.fotoModelo && (
              <Image
                source={{ uri: formatPhotoUri(selectedEntryForModel.fotoModelo) }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Texto Explicativo */}
          <View style={styles.modalTextContainer}>
            <Text style={styles.modalTitle}>Foto Modelo</Text>
            <Text style={styles.modalDescription}>
              Esta é uma foto modelo a ser seguida. Use-a como referência para capturar sua foto.
            </Text>
          </View>

          {/* Botões de Ação */}
          <View style={styles.modalButtonContainer}>
            <TouchableOpacity style={styles.modalBackButton} onPress={closeModelPhotoModal}>
              <Text style={styles.modalBackButtonText}>Voltar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalTakePhotoButton} onPress={takePhotoFromModal}>
              <Ionicons name="camera" size={20} color="white" style={styles.modalButtonIcon} />
              <Text style={styles.modalTakePhotoButtonText}>Tirar Foto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingBottom: 80, // Espaço para o menu inferior
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#3b82f6',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: 'white',
  },
  headerRight: {
    width: 34,
  },
  stageNavigationContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#3b82f6', // Mesmo background do header
    borderBottomWidth: 1,
    borderBottomColor: '#2563eb',
  },
  navigationIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  leftIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 8,
    width: 88, // Largura fixa para sempre reservar espaço (80px + 8px padding)
  },
  centerButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 8,
    width: 88, // Largura fixa para sempre reservar espaço (80px + 8px padding)
  },
  translucentButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  translucentButtonPart: {
    paddingHorizontal: 8,
    paddingVertical: 8, // Reduzido para acomodar duas linhas
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.3)', // Aumentei a opacidade
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)', // Aumentei a opacidade da borda
    alignItems: 'center',
    justifyContent: 'center',
    width: 80, // Largura fixa para os pedaços
    height: 48, // Altura fixa para manter alinhamento
    overflow: 'hidden',
    marginBottom: 4, // Espaço para a linha embaixo
  },
  translucentButtonText: {
    fontSize: RFValue(8),
    fontWeight: '600',
    color: '#ffffff', // Mudei para branco para contrastar melhor
    textAlign: 'center',
    lineHeight: 12, // Altura da linha para duas linhas
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
  photoContainer: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  photoArea: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#000000',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAreaWithCapturedImage: {
    borderStyle: 'solid',
    borderColor: '#10b981',
    backgroundColor: 'transparent',
  },
  photoAreaWithModelImage: {
    borderStyle: 'solid',
    borderColor: '#ef4444',
    backgroundColor: 'transparent',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
  },
  modalCloseButton: {
    padding: 10,
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 200,
  },
  modalImage: {
    width: '90%',
    height: '100%',
  },
  modalTextContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: RFValue(18),
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: RFValue(14),
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
    gap: 15,
  },
  modalBackButton: {
    flex: 1,
    paddingVertical: 15,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#374151',
  },
  modalTakePhotoButton: {
    flex: 1,
    paddingVertical: 15,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalButtonIcon: {
    marginRight: 8,
  },
  modalTakePhotoButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: 'white',
  },
  centerStageButton: {
    paddingHorizontal: 20,
    paddingVertical: 8, // Ajustado para manter altura similar
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    width: 250,
    minHeight: 48, // Altura mínima para manter alinhamento
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4, // Espaço para a linha embaixo
  },
  centerStageButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  activeStageButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  activeStageButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  centerButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentIndicatorLine: {
    width: 250,
    height: 3,
    backgroundColor: '#10b981',
    borderRadius: 1,
  },
  completedIndicatorLine: {
    width: 80,
    height: 3,
    backgroundColor: '#10b981',
    borderRadius: 1,
  },
  pendingIndicatorLine: {
    width: 80,
    height: 3,
    backgroundColor: '#e5e7eb',
    borderRadius: 1,
  },
});

export default PhotoCollectionScreen; 