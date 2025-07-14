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
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import * as ImagePicker from 'expo-image-picker';
import { WorkOrder, User } from '../types/workOrder';
import { ServiceStep, ServiceStepData } from '../services/serviceStepsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [comentarios, setComentarios] = useState<{ [stepId: number]: string }>({});
  const [fotosSalvasUsuario, setFotosSalvasUsuario] = useState<{ [entryId: number]: string }>({});

  // Estados para o modal de foto atual
  const [showCurrentPhotoModal, setShowCurrentPhotoModal] = useState(false);
  const [selectedEntryForCurrent, setSelectedEntryForCurrent] = useState<PhotoEntry | null>(null);

  // Estado para armazenar alturas mínimas dos títulos por etapa
  const [titleHeightsByStep, setTitleHeightsByStep] = useState<{ [stepId: number]: number }>({});

  // Flags de controle para prevenir loops infinitos e execuções simultâneas
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [lastActiveStepIndex, setLastActiveStepIndex] = useState(-1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isChangingStep, setIsChangingStep] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      // Usar timeout para evitar execução imediata que pode causar problemas
      const timeoutId = setTimeout(() => {
        loadServiceSteps();
        setIsInitialized(true);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isInitialized]);

  // Centralizar o step ativo quando mudar - COM PROTEÇÃO CONTRA LOOPS
  useEffect(() => {
    if (steps.length > 0 && stageScrollViewRef.current && activeStepIndex !== lastActiveStepIndex && !isChangingStep) {
      console.log('🎯 Centralizando step:', { activeStepIndex, lastActiveStepIndex });
      
      // Usar timeout para evitar conflitos
      const timeoutId = setTimeout(() => {
        setLastActiveStepIndex(activeStepIndex);
        centerCurrentStage();
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeStepIndex, steps.length, lastActiveStepIndex, isChangingStep]);

  // Carregar comentário quando a etapa ativa mudar - COM PROTEÇÃO CONTRA LOOPS
  useEffect(() => {
    if (steps.length > 0 && activeStepIndex < steps.length && activeStepIndex !== lastActiveStepIndex && !isSavingComment && !isChangingStep) {
      console.log('💬 Carregando comentário para step:', activeStepIndex);
      
      // Usar timeout para evitar conflitos
      const timeoutId = setTimeout(() => {
        loadComentarioEtapa(activeStepIndex);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeStepIndex, steps.length, lastActiveStepIndex, isSavingComment, isChangingStep]);

  // Função para centralizar a etapa atual - COM PROTEÇÃO CONTRA LOOPS
  const centerCurrentStage = () => {
    if (steps.length > 0 && stageScrollViewRef.current && activeStepIndex >= 0 && activeStepIndex < steps.length) {
      const scrollToIndex = activeStepIndex;
      const buttonWidth = 200;
      const buttonMargin = 20;
      const containerWidth = 375; // Largura fixa para cálculo consistente
      
      const scrollToX = (scrollToIndex * (buttonWidth + buttonMargin)) - (containerWidth / 2) + (buttonWidth / 2);
      
      // Usar timeout para evitar conflitos com renderização
      const timeoutId = setTimeout(() => {
        try {
          stageScrollViewRef.current?.scrollTo({
            x: Math.max(0, scrollToX),
            animated: true,
          });
        } catch (scrollError) {
          console.warn('⚠️ Erro ao centralizar step:', scrollError);
        }
      }, 200);
      
      // Limpar timeout se componente for desmontado
      return () => clearTimeout(timeoutId);
    }
  };

  // Função para carregar comentário de uma etapa
  const loadComentarioEtapa = async (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      const currentStep = steps[stepIndex];
      try {
        // BUSCAR COMENTÁRIO DIRETO DO ASYNCSTORAGE - SEM REQUISIÇÕES ONLINE
        const offlineKey = 'offline_comentarios_etapa';
        const existingDataStr = await AsyncStorage.getItem(offlineKey);
        
        if (existingDataStr) {
          const existingData = JSON.parse(existingDataStr);
          const recordKey = `${workOrder.id}-${currentStep.id}`;
          const comentario = existingData[recordKey];
          
          if (comentario && comentario.comentario) {
            setComentarios(prev => ({
              ...prev,
              [currentStep.id]: comentario.comentario
            }));
            console.log('💬 Comentário carregado do cache offline');
          }
        }
      } catch (error) {
        console.error('Erro ao carregar comentário da etapa offline:', error);
      }
    }
  };

  // Função para salvar comentário da etapa atual - COM PROTEÇÃO CONTRA LOOPS
  const saveCurrentComentario = async () => {
    // Proteção contra execuções simultâneas
    if (isSavingComment) {
      console.log('⚠️ saveCurrentComentario já em execução, ignorando nova chamada');
      return;
    }

    try {
      setIsSavingComment(true);
      
      if (activeStepIndex >= 0 && activeStepIndex < steps.length) {
        const currentStep = steps[activeStepIndex];
        const comentario = comentarios[currentStep.id] || '';
        
        if (comentario.trim()) {
          console.log('💬 Salvando comentário da etapa atual OFFLINE:', { stepId: currentStep.id, comentarioLength: comentario.length });
          
          try {
            // SALVAR DIRETO NO ASYNCSTORAGE - SEM IMPORTS DINÂMICOS
            const offlineKey = 'offline_comentarios_etapa';
            const existingDataStr = await AsyncStorage.getItem(offlineKey);
            const existingData = existingDataStr ? JSON.parse(existingDataStr) : {};
            
            const recordKey = `${workOrder.id}-${currentStep.id}`;
            existingData[recordKey] = {
              ordem_servico_id: workOrder.id,
              etapa_id: currentStep.id,
              comentario: comentario.trim(),
              created_at: new Date().toISOString(),
              synced: false
            };
            
            await AsyncStorage.setItem(offlineKey, JSON.stringify(existingData));
            console.log('✅ Comentário salvo offline com sucesso');
          } catch (offlineError) {
            console.error('💥 Erro ao salvar comentário offline:', offlineError);
          }
        } else {
          console.log('💬 Comentário vazio, não salvando');
        }
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao salvar comentário:', error);
    } finally {
      setIsSavingComment(false);
    }
  };

  // Função para atualizar comentário - SEM SALVAMENTO AUTOMÁTICO
  const updateComentario = (text: string) => {
    if (activeStepIndex >= 0 && activeStepIndex < steps.length) {
      const currentStep = steps[activeStepIndex];
      setComentarios(prev => ({
        ...prev,
        [currentStep.id]: text
      }));
    }
  };

  const loadServiceSteps = async () => {
    // Proteção contra execuções simultâneas
    if (isLoadingSteps) {
      console.log('⚠️ loadServiceSteps já em execução, ignorando nova chamada');
      return;
    }

    setIsLoadingSteps(true);
    setIsLoading(true);
    
    try {
      if (!workOrder.tipo_os_id) {
        console.warn('⚠️ Nenhum tipo_os_id disponível');
        setSteps([]);
        setPhotoEntries([]);
        return;
      }

      console.log('🔍 Carregando etapas do armazenamento híbrido...');
      
      try {
        // USAR STORAGE ADAPTER ao invés do AsyncStorage direto
        const { default: storageAdapter } = await import('../services/storageAdapter');
        
        const stepsCache = await storageAdapter.getItem('cached_service_steps');
        const entriesCache = await storageAdapter.getItem('cached_service_entries');
        
        if (stepsCache) {
          const cache = JSON.parse(stepsCache);
          const stepsData = cache[workOrder.tipo_os_id];
          
          if (stepsData && stepsData.length > 0) {
            console.log(`📝 ${stepsData.length} etapas encontradas no armazenamento híbrido`);
            
            // Processar entradas se existirem
            let finalSteps = stepsData;
            if (entriesCache) {
              try {
                const entriesData = JSON.parse(entriesCache);
                finalSteps = stepsData.map((step: ServiceStep) => ({
                  ...step,
                  entradas: entriesData[step.id] || []
                }));
              } catch (entriesError) {
                console.warn('⚠️ Erro ao processar entradas, usando etapas sem entradas:', entriesError);
                finalSteps = stepsData.map((step: ServiceStep) => ({ ...step, entradas: [] }));
              }
            } else {
              finalSteps = stepsData.map((step: ServiceStep) => ({ ...step, entradas: [] }));
            }
            
            setSteps(finalSteps);
            
            // Criar lista de entradas para fotos
            const entries: PhotoEntry[] = [];
            finalSteps.forEach((step: ServiceStep) => {
              step.entradas?.forEach((entry: ServiceStepData) => {
                const titulo = entry.titulo || entry.valor || `Entrada ${entry.ordem_entrada}`;
                
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
            console.log(`📸 ${entries.length} entradas de foto processadas`);
            
            // Tentar carregar fotos salvas sem bloquear
            if (entries.length > 0) {
              try {
                // Buscar dados da tabela offline primeiro
                const offlineData = await AsyncStorage.getItem('offline_dados_records');
                const offlinePhotos: { [entradaId: number]: string } = {};
                
                if (offlineData) {
                  const records = JSON.parse(offlineData);
                  Object.values(records).forEach((record: any) => {
                    if (record.ordem_servico_id === workOrder.id && record.valor) {
                      offlinePhotos[record.entrada_dados_id] = record.valor;
                    }
                  });
                }
                
                setFotosSalvasUsuario(offlinePhotos);
                console.log(`📸 ${Object.keys(offlinePhotos).length} fotos offline carregadas`);
              } catch (fotosError) {
                console.warn('⚠️ Erro ao carregar fotos offline:', fotosError);
                setFotosSalvasUsuario({});
              }
            }
            
            return;
          }
        }
        
        console.log('❌ Nenhum dado no cache encontrado');
        setSteps([]);
        setPhotoEntries([]);
        setFotosSalvasUsuario({});
        
      } catch (cacheError) {
        console.error('💥 Erro ao buscar cache:', cacheError);
        setSteps([]);
        setPhotoEntries([]);
        setFotosSalvasUsuario({});
      }
    } catch (error) {
      console.error('💥 Erro inesperado no carregamento:', error);
      setSteps([]);
      setPhotoEntries([]);
      setFotosSalvasUsuario({});
    } finally {
      setIsLoading(false);
      setIsLoadingSteps(false);
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
        
        // Restaurar StatusBar após captura
        setTimeout(() => {
          StatusBar.setBackgroundColor('#3b82f6', true);
          StatusBar.setBarStyle('light-content', true);
        }, 50);
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
      console.error('Erro ao tirar foto:', error);
    } finally {
      // Garantir que o StatusBar seja restaurado mesmo em caso de erro
      setTimeout(() => {
        StatusBar.setBackgroundColor('#3b82f6', true);
        StatusBar.setBarStyle('light-content', true);
      }, 100);
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

  const openCurrentPhotoModal = (entry: PhotoEntry) => {
    setSelectedEntryForCurrent(entry);
    setShowCurrentPhotoModal(true);
  };

  const closeCurrentPhotoModal = () => {
    setShowCurrentPhotoModal(false);
    setSelectedEntryForCurrent(null);
  };

  const removePhotoFromModal = () => {
    if (!selectedEntryForCurrent) return;
    
    Alert.alert(
      'Confirmar Remoção',
      'Tem certeza que deseja remover esta foto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Remover', 
          style: 'destructive',
          onPress: () => {
            const entryId = selectedEntryForCurrent.id;
            const hasPhoto = collectedPhotos[entryId];
            const hasFotoSalva = fotosSalvasUsuario[entryId];
            
            if (hasPhoto) {
              // Se é foto da sessão atual, remover da sessão
              console.log(`��️ Removendo foto da sessão via modal (entrada ${entryId})`);
              removePhoto(entryId);
            } else if (hasFotoSalva) {
              // Se é foto salva, remover do estado local
              console.log(`🗑️ Removendo foto salva via modal (entrada ${entryId})`);
              setFotosSalvasUsuario(prev => {
                const updated = { ...prev };
                delete updated[entryId];
                return updated;
              });
            }
            
            // Fechar modal após remoção
            closeCurrentPhotoModal();
          }
        }
      ]
    );
  };

  const takePhotoFromModal = async () => {
    try {
      if (!selectedEntryForModel) {
        console.warn('⚠️ Nenhuma entrada selecionada para o modal');
        return;
      }
      
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
          
          // Salvar DIRETO no AsyncStorage - SEM IMPORTS DINÂMICOS
          console.log('💾 Salvando foto direto no AsyncStorage...');
          try {
            const offlineKey = 'offline_dados_records';
            const existingDataStr = await AsyncStorage.getItem(offlineKey);
            const existingData = existingDataStr ? JSON.parse(existingDataStr) : {};
            
            const recordKey = `${workOrder.id}-${selectedEntryForModel.id}-${Date.now()}`;
            existingData[recordKey] = {
              ativo: 1,
              valor: photoUri,
              ordem_servico_id: workOrder.id,
              entrada_dados_id: selectedEntryForModel.id,
              created_at: new Date().toISOString(),
              synced: false
            };
            
            await AsyncStorage.setItem(offlineKey, JSON.stringify(existingData));
            
            // Adicionar ao estado local para exibição
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
            
            console.log('✅ Foto salva offline com sucesso');
            console.log(`✅ Foto capturada e salva para entrada ${selectedEntryForModel.id}`);
            
            // Restaurar StatusBar após captura
            setTimeout(() => {
              StatusBar.setBackgroundColor('#3b82f6', true);
              StatusBar.setBarStyle('light-content', true);
            }, 50);
          } catch (offlineError) {
            console.error('💥 Erro ao salvar foto offline:', offlineError);
            Alert.alert('Erro', 'Não foi possível salvar a foto. Tente novamente.');
          }
        }
      } catch (cameraError) {
        console.error('💥 Erro na câmera:', cameraError);
        Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
      }
    } catch (error) {
      console.error('💥 Erro inesperado ao tirar foto:', error);
      Alert.alert('Erro', 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      // Garantir que o StatusBar seja restaurado mesmo em caso de erro
      setTimeout(() => {
        StatusBar.setBackgroundColor('#3b82f6', true);
        StatusBar.setBarStyle('light-content', true);
      }, 150);
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
    // Salvar comentário da etapa atual antes de qualquer ação
    await saveCurrentComentario();

    // Se não estiver na primeira etapa, voltar para a etapa anterior
    if (activeStepIndex > 0) {
      console.log(`📱 Voltando da etapa ${activeStepIndex + 1} para etapa ${activeStepIndex}`);
      setActiveStepIndex(activeStepIndex - 1);
      return;
    }

    // Se estiver na primeira etapa (índice 0), voltar para a tela anterior
    try {
      console.log('📱 Na primeira etapa, voltando para tela anterior...');
      
      // SIMPLIFICADO: Sempre voltar para ServiceSteps se a função existir, senão voltar normalmente
      if (onBackToServiceSteps) {
        console.log('✅ Voltando para etapas/checklist');
        onBackToServiceSteps();
      } else {
        console.log('📱 Voltando normalmente');
        onBackPress();
      }
    } catch (error) {
      console.error('💥 Erro inesperado no back:', error);
      // Em caso de erro, voltar normalmente
      onBackPress();
    }
  };

  const handleNext = async () => {
    // Proteção contra mudanças simultâneas
    if (isChangingStep) {
      console.log('⚠️ Mudança de step já em progresso, ignorando');
      return;
    }

    if (activeStepIndex < steps.length - 1) {
      try {
        setIsChangingStep(true);
        
        // Salvar comentário da etapa atual antes de avançar
        await saveCurrentComentario();
        
        console.log(`🔄 Avançando da etapa ${activeStepIndex} para ${activeStepIndex + 1}`);
        setActiveStepIndex(activeStepIndex + 1);
      } catch (error) {
        console.error('💥 Erro ao avançar etapa:', error);
      } finally {
        setTimeout(() => setIsChangingStep(false), 500);
      }
    }
  };

  const handlePrevious = async () => {
    // Proteção contra mudanças simultâneas
    if (isChangingStep) {
      console.log('⚠️ Mudança de step já em progresso, ignorando');
      return;
    }

    if (activeStepIndex > 0) {
      try {
        setIsChangingStep(true);
        
        // Salvar comentário da etapa atual antes de voltar
        await saveCurrentComentario();
        
        console.log(`🔄 Voltando da etapa ${activeStepIndex} para ${activeStepIndex - 1}`);
        setActiveStepIndex(activeStepIndex - 1);
      } catch (error) {
        console.error('💥 Erro ao voltar etapa:', error);
      } finally {
        setTimeout(() => setIsChangingStep(false), 500);
      }
    }
  };

  const handleFinish = async () => {
    try {
      // Salvar comentário da etapa atual antes de finalizar
      await saveCurrentComentario();
      
      const totalEntries = photoEntries.length;
      const photosCollected = Object.keys(collectedPhotos).length;
      
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
    } catch (error) {
      console.error('💥 Erro ao finalizar:', error);
    }
  };

  const handleStepPress = async (index: number) => {
    // Proteção contra mudanças simultâneas
    if (isChangingStep || index === activeStepIndex) {
      console.log('⚠️ Mudança de step já em progresso ou step é o mesmo, ignorando');
      return;
    }

    try {
      setIsChangingStep(true);
      
      // Salvar comentário da etapa atual antes de trocar
      await saveCurrentComentario();
      
      console.log(`🔄 Mudando para etapa ${index}`);
      setActiveStepIndex(index);
    } catch (error) {
      console.error('💥 Erro ao mudar etapa:', error);
    } finally {
      setTimeout(() => setIsChangingStep(false), 500);
    }
  };

  // Função para calcular altura necessária para um texto
  const calculateTextHeight = (text: string, maxWidth: number): number => {
    const fontSize = RFValue(12);
    const lineHeight = fontSize * 1.4; // Aproximadamente 1.4x o tamanho da fonte
    const characterWidth = fontSize * 0.6; // Aproximadamente 0.6x o tamanho da fonte
    const charactersPerLine = Math.floor(maxWidth / characterWidth);
    const numberOfLines = Math.max(1, Math.ceil(text.length / charactersPerLine));
    
    return numberOfLines * lineHeight + 20; // + 20 para padding
  };

  // Função para calcular alturas mínimas dos títulos por etapa
  const calculateTitleHeights = () => {
    if (photoEntries.length === 0 || steps.length === 0) return;

    const cardWidth = (width - 60) / 2; // Largura do card
    const titleWidth = cardWidth - 30; // Largura do título (descontando padding)
    const heightsByStep: { [stepId: number]: number } = {};

    // Para cada etapa, encontrar a altura máxima necessária
    steps.forEach(step => {
      const stepEntries = photoEntries.filter(entry => entry.stepId === step.id);
      let maxHeight = 0;

      stepEntries.forEach(entry => {
        const height = calculateTextHeight(entry.titulo, titleWidth);
        maxHeight = Math.max(maxHeight, height);
      });

      heightsByStep[step.id] = maxHeight || 40; // Altura mínima de 40
    });

    setTitleHeightsByStep(heightsByStep);
  };

  // Recalcular alturas quando photoEntries ou steps mudarem
  useEffect(() => {
    if (photoEntries.length > 0 && steps.length > 0) {
      calculateTitleHeights();
    }
  }, [photoEntries, steps]);

  const renderPhotoCard = (entry: PhotoEntry) => {
    const hasPhoto = collectedPhotos[entry.id]; // Foto da sessão atual
    const hasFotoSalva = fotosSalvasUsuario[entry.id]; // Foto já salva pelo usuário
    const hasFotoModelo = entry.fotoModelo; // Foto modelo do banco
    
    // NOVA REGRA: Sempre mostrar tracejado inicialmente
    // Só mostrar a foto se foi capturada na sessão atual OU se já tinha foto salva
    let shouldShowPhoto = hasPhoto || hasFotoSalva;
    let photoToShow = null;
    
    if (shouldShowPhoto) {
      if (hasPhoto) {
        photoToShow = hasPhoto; // Foto da sessão atual
      } else if (hasFotoSalva) {
        photoToShow = hasFotoSalva; // Foto já salva pelo usuário
      }
    }

    // Obter altura mínima do título para esta etapa
    const currentStep = steps[activeStepIndex];
    const titleMinHeight = titleHeightsByStep[currentStep?.id] || 40;
    
    return (
      <View key={entry.id} style={styles.photoCard}>
        <View style={[styles.photoCardTitleContainer, { minHeight: titleMinHeight }]}>
          <Text style={styles.photoCardTitle}>{entry.titulo}</Text>
        </View>
        
        <View style={styles.photoContainer}>
          <TouchableOpacity
            style={[
              styles.photoArea,
              shouldShowPhoto && styles.photoAreaWithCapturedImage, // Verde apenas quando há foto para mostrar
            ]}
            onPress={() => {
              // NOVA REGRA: Se já tem foto, abrir modal da foto atual
              if (shouldShowPhoto) {
                console.log(`📷 Abrindo modal da foto atual (entrada ${entry.id})`);
                openCurrentPhotoModal(entry);
              }
              // Se não tem foto mas tem foto modelo, abrir modal da foto modelo
              else if (hasFotoModelo) {
                console.log(`🖼️ Abrindo modal da foto modelo (entrada ${entry.id})`);
                openModelPhotoModal(entry);
              }
              // Se não tem foto modelo, abrir câmera diretamente
              else {
                console.log(`📷 Abrindo câmera diretamente (entrada ${entry.id})`);
                takePhoto(entry.id);
              }
            }}
          >
            {shouldShowPhoto && photoToShow ? (
              <Image source={{ uri: photoToShow }} style={styles.photoImage} />
            ) : (
              <Ionicons name="camera" size={40} color="#000000" />
            )}
          </TouchableOpacity>
          
          {/* Mostrar botão de remoção apenas quando há foto capturada na sessão atual ou foto salva */}
          {shouldShowPhoto && (
            <TouchableOpacity
              style={styles.removePhotoButton}
              onPress={() => {
                Alert.alert(
                  'Confirmar Remoção',
                  'Tem certeza que deseja remover esta foto?',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { 
                      text: 'Remover', 
                      style: 'destructive',
                      onPress: () => {
                        if (hasPhoto) {
                          // Se é foto da sessão atual, remover da sessão
                          console.log(`🗑️ Removendo foto da sessão (entrada ${entry.id})`);
                          removePhoto(entry.id);
                        } else if (hasFotoSalva) {
                          // Se é foto salva, remover do estado local (volta para tracejado)
                          console.log(`🗑️ Removendo foto salva do estado local (entrada ${entry.id})`);
                          setFotosSalvasUsuario(prev => {
                            const updated = { ...prev };
                            delete updated[entry.id];
                            return updated;
                          });
                        }
                      }
                    }
                  ]
                );
              }}
            >
              <Ionicons name="trash" size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Forçar restauração do StatusBar após mudanças de foto
  useEffect(() => {
    // Pequeno delay para garantir que qualquer interferência do ImagePicker tenha terminado
    const timeout = setTimeout(() => {
      StatusBar.setBackgroundColor('#3b82f6', true);
      StatusBar.setBarStyle('light-content', true);
    }, 100);

    return () => clearTimeout(timeout);
  }, [collectedPhotos, fotosSalvasUsuario]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
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
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
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

      {/* Campo de Comentário */}
      <View style={styles.commentContainer}>
        <Text style={styles.commentLabel}>Deseja falar mais sobre esta etapa?</Text>
        <TextInput
          style={styles.commentInput}
          placeholder="Digite aqui..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
          value={comentarios[steps[activeStepIndex]?.id] || ''}
          onChangeText={updateComentario}
          textAlignVertical="top"
        />
      </View>

      {/* Navigation Buttons */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={[styles.navButton, styles.previousButton]}
          onPress={handleBackPress}
        >
          <Text style={styles.previousButtonText}>
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

      {/* Modal de Foto Modelo em Tela Cheia */}
      <Modal
        visible={showModelPhotoModal}
        animationType="fade"
        onRequestClose={closeModelPhotoModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <StatusBar backgroundColor="black" barStyle="light-content" />
          
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
        </SafeAreaView>
      </Modal>

      {/* Modal de Foto Atual em Tela Cheia */}
      <Modal
        visible={showCurrentPhotoModal}
        animationType="fade"
        onRequestClose={closeCurrentPhotoModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <StatusBar backgroundColor="black" barStyle="light-content" />
          
          {/* Foto Atual - Ocupa mais espaço sem header e texto */}
          <View style={styles.modalImageContainerFullscreen}>
            {selectedEntryForCurrent && (
              <Image
                source={{ 
                  uri: collectedPhotos[selectedEntryForCurrent.id] || fotosSalvasUsuario[selectedEntryForCurrent.id] 
                }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Botões de Ação */}
          <View style={styles.modalButtonContainer}>
            <TouchableOpacity style={styles.modalBackButton} onPress={closeCurrentPhotoModal}>
              <Text style={styles.modalBackButtonText}>Voltar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.modalRemovePhotoButton} onPress={removePhotoFromModal}>
              <Ionicons name="trash" size={20} color="white" style={styles.modalButtonIcon} />
              <Text style={styles.modalRemovePhotoButtonText}>Remover Foto</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  leftIndicator: {
    flexDirection: 'row',
    alignItems: 'stretch',
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
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingLeft: 8,
    width: 88, // Largura fixa para sempre reservar espaço (80px + 8px padding)
  },
  translucentButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  translucentButtonPart: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    flex: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  translucentButtonText: {
    fontSize: RFValue(8),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 12,
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
  photoCardTitleContainer: {
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCardTitle: {
    fontSize: RFValue(12),
    fontWeight: '600',
    color: '#374151',
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
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousButton: {
    backgroundColor: '#3b82f6',
  },
  nextButton: {
    backgroundColor: '#E0ED54',
  },
  finishButton: {
    backgroundColor: '#E0ED54',
  },
  previousButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: 'white',
  },
  nextButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#000000',
  },
  finishButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#000000',
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
    paddingVertical: 8,
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
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
    minHeight: 56, // Altura mínima para o container inteiro (botão + linha)
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
  commentContainer: {
    padding: 20,
    backgroundColor: 'white',
  },
  commentLabel: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  commentInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    fontSize: RFValue(14),
    color: '#374151',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalRemovePhotoButton: {
    flex: 1,
    paddingVertical: 15,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalRemovePhotoButtonText: {
    fontSize: RFValue(14),
    fontWeight: '600',
    color: 'white',
  },
  modalImageContainerFullscreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 200,
  },
});

export default PhotoCollectionScreen; 