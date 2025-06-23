import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PostServiceAuditScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onFinishAudit: (auditData: AuditData) => void;
  onBackToServiceSteps?: () => void;
  onSkipToPhotoCollection?: () => void;
}

interface AuditData {
  workCompleted: boolean;
  reason?: string;
  additionalComments?: string;
  userPhoto?: string;
  skipPhotoCollection?: boolean;
}

const PostServiceAuditScreen: React.FC<PostServiceAuditScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onFinishAudit,
  onBackToServiceSteps,
  onSkipToPhotoCollection,
}) => {
  const [workCompleted, setWorkCompleted] = useState<boolean | null>(true);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [additionalComments, setAdditionalComments] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [finalPhoto, setFinalPhoto] = useState<string | null>(null);
  const [isCheckingPhoto, setIsCheckingPhoto] = useState(true);

  const reasons = [
    'Cliente não recebeu',
    'Problema técnico',
    'Material insuficiente',
    'Acesso negado',
    'Reagendamento solicitado',
    'Outros'
  ];

  useEffect(() => {
    checkExistingFinalPhoto();
    debugAsyncStorage();
  }, []);

  const checkExistingFinalPhoto = async () => {
    try {
      setIsCheckingPhoto(true);
      
      console.log('🔍 Verificando se foto final já existe...');
      
      // Verificar no AsyncStorage das ações offline
      const offlineActionsStr = await AsyncStorage.getItem('offline_actions');
      
      if (offlineActionsStr) {
        const offlineActions = JSON.parse(offlineActionsStr);
        
        // Procurar por auditoria final já concluída para esta OS
        const hasAuditoriaFinal = Object.values(offlineActions).some((action: any) => 
          action.type === 'AUDITORIA_FINAL' && 
          action.workOrderId === workOrder.id
        );
        
        if (hasAuditoriaFinal) {
          console.log('✅ Auditoria final já existe - pulando para coleta de fotos');
          
          // Se onSkipToPhotoCollection estiver disponível, usar ela
          if (onSkipToPhotoCollection) {
            onSkipToPhotoCollection();
            return;
          } else {
            // Caso contrário, usar onFinishAudit sem skipPhotoCollection
            onFinishAudit({ workCompleted: true, reason: '', additionalComments: '' });
            return;
          }
        }
      }
      
      console.log('📱 Foto final não existe - continuando na tela de auditoria');
      // Sempre continuar na tela normalmente (sem bloquear por verificações online)
      setIsCheckingPhoto(false);
    } catch (error) {
      console.error('💥 Erro ao verificar foto final offline:', error);
      // Em caso de erro, sempre continuar na tela normalmente
      setIsCheckingPhoto(false);
    }
  };

  // Função de debug para verificar AsyncStorage
  const debugAsyncStorage = async () => {
    try {
      console.log('🔍 DEBUG: Verificando AsyncStorage...');
      const offlineActionsStr = await AsyncStorage.getItem('offline_actions');
      if (offlineActionsStr) {
        const offlineActions = JSON.parse(offlineActionsStr);
        console.log('📱 DEBUG: Ações offline encontradas:', Object.keys(offlineActions).length);
        
        // Verificar ações relacionadas a esta OS
        const thisOSActions = Object.values(offlineActions).filter((action: any) => 
          action.workOrderId === workOrder.id
        );
        console.log(`📱 DEBUG: Ações para OS ${workOrder.id}:`, thisOSActions.length);
        
        thisOSActions.forEach((action: any, index) => {
          console.log(`📱 DEBUG: Ação ${index + 1}: ${action.type} - ${action.timestamp}`);
        });
      } else {
        console.log('📱 DEBUG: Nenhuma ação offline encontrada');
      }
    } catch (error) {
      console.error('💥 DEBUG: Erro ao verificar AsyncStorage:', error);
    }
  };

  const handleFinalPhoto = async () => {
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
      });

      if (!result.canceled && result.assets[0]) {
        const photoUri = result.assets[0].uri;
        console.log('📸 DEBUG: Foto capturada:', photoUri);
        setFinalPhoto(photoUri);

        // Salvar foto no AsyncStorage (sempre salvar localmente primeiro)
        // A sincronização com o servidor será feita quando a auditoria completa for finalizada
        try {
          console.log('💾 DEBUG: Iniciando salvamento da foto final...');
          console.log('💾 DEBUG: WorkOrder ID:', workOrder.id);
          console.log('💾 DEBUG: User ID:', user.id);
          
          const offlineKey = 'offline_actions';
          const existingDataStr = await AsyncStorage.getItem(offlineKey);
          const existingData = existingDataStr ? JSON.parse(existingDataStr) : {};
          
          console.log('💾 DEBUG: Dados existentes no AsyncStorage:', Object.keys(existingData).length, 'ações');
          
          const actionId = `photo_final_${workOrder.id}_${user.id}_${Date.now()}`;
          console.log('💾 DEBUG: Action ID gerado:', actionId);
          
          existingData[actionId] = {
            id: actionId,
            type: 'PHOTO_FINAL',
            timestamp: new Date().toISOString(),
            workOrderId: workOrder.id,
            technicoId: user.id,
            data: {
              photoUri,
            },
            synced: false,
            attempts: 0
          };
          
          console.log('💾 DEBUG: Salvando no AsyncStorage...');
          await AsyncStorage.setItem(offlineKey, JSON.stringify(existingData));
          console.log('✅ DEBUG: Foto final salva no AsyncStorage com sucesso');
          
          // Verificar se foi salvo
          const verifyDataStr = await AsyncStorage.getItem(offlineKey);
          if (verifyDataStr) {
            const verifyData = JSON.parse(verifyDataStr);
            console.log('✅ DEBUG: Verificação - dados salvos:', Object.keys(verifyData).length, 'ações');
            console.log('✅ DEBUG: Ação salva encontrada:', !!verifyData[actionId]);
          }
          
        } catch (saveError) {
          console.error('💥 DEBUG: Erro ao salvar foto final:', saveError);
          Alert.alert(
            'Erro',
            'Não foi possível salvar a foto. Tente novamente.'
          );
          setFinalPhoto(null);
        }
      }
    } catch (error) {
      console.error('💥 DEBUG: Erro na função handleFinalPhoto:', error);
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
    }
  };

  const handleFinish = async () => {
    console.log('🔄 DEBUG: handleFinish chamado');
    console.log('🔄 DEBUG: workCompleted:', workCompleted);
    console.log('🔄 DEBUG: selectedReason:', selectedReason);
    console.log('🔄 DEBUG: finalPhoto:', finalPhoto);
    console.log('🔄 DEBUG: canProceed:', canProceed);
    
    if (workCompleted === null) {
      console.log('❌ DEBUG: Erro: workCompleted é null');
      Alert.alert('Campo obrigatório', 'Por favor, informe se o trabalho foi realizado.');
      return;
    }

    if (!workCompleted && !selectedReason) {
      console.log('❌ DEBUG: Erro: trabalho não realizado e sem motivo');
      Alert.alert('Campo obrigatório', 'Por favor, selecione um motivo.');
      return;
    }

    if (!finalPhoto) {
      console.log('❌ DEBUG: Erro: sem foto final');
      Alert.alert('Foto obrigatória', 'Por favor, tire uma foto final para concluir a auditoria.');
      return;
    }

    console.log('✅ DEBUG: Todas as validações passaram, iniciando salvamento...');
    setIsLoading(true);
    
    try {
      // Tentar salvar auditoria completa no servidor primeiro (quando online)
      console.log('🌐 DEBUG: Verificando conectividade para salvar auditoria final...');
      
      // Verificar conectividade
      const NetInfo = require('@react-native-community/netinfo');
      const netInfo = await NetInfo.fetch();
      console.log('🌐 DEBUG: Status de conectividade:', netInfo.isConnected);
      
      if (netInfo.isConnected) {
        console.log('🌐 DEBUG: Online - tentando salvar auditoria final no servidor...');
        
        try {
          // Importar dinamicamente o serviço de auditoria
          const { saveAuditoriaFinal } = await import('../services/auditService');
          
          console.log('📊 DEBUG: Chamando saveAuditoriaFinal com os dados:');
          console.log('📊 DEBUG: - workOrderId:', workOrder.id);
          console.log('📊 DEBUG: - technicoId:', user.id);
          console.log('📊 DEBUG: - photoUri:', finalPhoto.substring(0, 50) + '...');
          console.log('📊 DEBUG: - trabalhoRealizado:', workCompleted);
          console.log('📊 DEBUG: - motivo:', !workCompleted ? selectedReason : undefined);
          console.log('📊 DEBUG: - comentario:', additionalComments.trim() || undefined);
          
          // Salvar auditoria completa no servidor
          const { data, error } = await saveAuditoriaFinal(
            workOrder.id,
            user.id,
            finalPhoto,
            workCompleted,
            !workCompleted ? selectedReason : undefined,
            additionalComments.trim() || undefined
          );
          
          console.log('📊 DEBUG: Resultado do saveAuditoriaFinal:');
          console.log('📊 DEBUG: - data:', data ? 'Presente' : 'Nulo');
          console.log('📊 DEBUG: - error:', error);
          
          if (!error && data) {
            console.log('✅ DEBUG: Auditoria final salva no servidor com sucesso');
            
            // Sucesso no servidor, prosseguir com o fluxo
            if (!workCompleted) {
              console.log('🚀 DEBUG: Trabalho não realizado - indo direto para salvamento');
              onFinishAudit({ workCompleted, reason: selectedReason, additionalComments, skipPhotoCollection: true });
            } else {
              console.log('🚀 DEBUG: Trabalho realizado - seguindo fluxo normal');
              onFinishAudit({ workCompleted, reason: selectedReason, additionalComments });
            }
            return; // Sucesso, não precisa salvar offline
          } else {
            console.warn('⚠️ DEBUG: Erro ao salvar auditoria no servidor, salvando offline:', error);
          }
        } catch (serverError) {
          console.error('💥 DEBUG: Erro ao salvar no servidor:', serverError);
        }
      } else {
        console.log('📱 DEBUG: Offline - salvando auditoria final no AsyncStorage...');
      }
      
      // Se chegou aqui, está offline ou houve erro no servidor
      // Salvar no AsyncStorage para sincronização posterior
      console.log('💾 DEBUG: Salvando auditoria final no AsyncStorage...');
      console.log('💾 DEBUG: WorkOrder ID:', workOrder.id);
      console.log('💾 DEBUG: User ID:', user.id);
      
      const offlineKey = 'offline_actions';
      const existingDataStr = await AsyncStorage.getItem(offlineKey);
      const existingData = existingDataStr ? JSON.parse(existingDataStr) : {};
      
      console.log('💾 DEBUG: Dados existentes no AsyncStorage:', Object.keys(existingData).length, 'ações');
      
      const actionId = `auditoria_final_${workOrder.id}_${Date.now()}`;
      console.log('💾 DEBUG: Action ID gerado:', actionId);
      
      const auditoriaData = {
        id: actionId,
        type: 'AUDITORIA_FINAL',
        timestamp: new Date().toISOString(),
        workOrderId: workOrder.id,
        technicoId: user.id,
        data: {
          photoUri: finalPhoto,
          trabalhoRealizado: workCompleted,
          motivo: !workCompleted ? selectedReason : undefined,
          comentario: additionalComments.trim() || undefined,
        },
        synced: false,
        attempts: 0,
      };
      
      console.log('💾 DEBUG: Dados da auditoria:', JSON.stringify(auditoriaData, null, 2));
      
      existingData[actionId] = auditoriaData;
      
      console.log('💾 DEBUG: Salvando no AsyncStorage...');
      await AsyncStorage.setItem(offlineKey, JSON.stringify(existingData));
      console.log('✅ DEBUG: Auditoria final salva no AsyncStorage com sucesso');
      
      // Verificar se foi salvo
      const verifyDataStr = await AsyncStorage.getItem(offlineKey);
      if (verifyDataStr) {
        const verifyData = JSON.parse(verifyDataStr);
        console.log('✅ DEBUG: Verificação - dados salvos:', Object.keys(verifyData).length, 'ações');
        console.log('✅ DEBUG: Ação salva encontrada:', !!verifyData[actionId]);
      }
      
      // Prosseguir com o fluxo
      if (!workCompleted) {
        console.log('🚀 DEBUG: Trabalho não realizado - indo direto para salvamento');
        onFinishAudit({ workCompleted, reason: selectedReason, additionalComments, skipPhotoCollection: true });
      } else {
        console.log('🚀 DEBUG: Trabalho realizado - seguindo fluxo normal');
        onFinishAudit({ workCompleted, reason: selectedReason, additionalComments });
      }
    } catch (error) {
      console.error('💥 DEBUG: Erro ao finalizar auditoria:', error);
      Alert.alert('Erro', 'Erro inesperado ao finalizar auditoria.');
    } finally {
      console.log('🏁 DEBUG: Finalizando handleFinish, setIsLoading(false)');
      setIsLoading(false);
    }
  };

  const canProceed = workCompleted !== null && (workCompleted || selectedReason) && finalPhoto;

  // Tela de loading enquanto verifica foto final
  if (isCheckingPhoto) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Ionicons name="camera" size={48} color="#3b82f6" />
          <Text style={styles.loadingText}>Verificando foto final...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Auditoria pós serviço</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Confirmation Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Confirmação de usuário*</Text>
          <Text style={styles.sectionSubtitle}>
            Por motivos de segurança, precisamos confirmar que quem está realizando a auditoria final é o técnico responsável.
          </Text>
          
          <View style={styles.photoAreaContainer}>
            {finalPhoto ? (
              <View style={styles.photoContainer}>
                <Image source={{ uri: finalPhoto }} style={styles.photoPreview} />
                <TouchableOpacity style={styles.removePhotoButton} onPress={() => setFinalPhoto(null)}>
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.takePhotoButton} onPress={handleFinalPhoto}>
                <Ionicons name="camera" size={32} color="#666" />
                <Text style={styles.takePhotoText}>Tirar Foto</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Work Completion Question */}
        <View style={styles.section}>
          <Text style={styles.questionTitle}>O trabalho foi realizado?*</Text>
          
          <View style={styles.radioGroup}>
            <TouchableOpacity 
              style={styles.radioOption}
              onPress={() => setWorkCompleted(true)}
            >
              <View style={[styles.radioCircle, workCompleted === true && styles.radioCircleSelected]}>
                {workCompleted === true && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.radioLabel}>Sim</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.radioOption}
              onPress={() => setWorkCompleted(false)}
            >
              <View style={[styles.radioCircle, workCompleted === false && styles.radioCircleSelected]}>
                {workCompleted === false && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.radioLabel}>Não</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reason Dropdown - Only show if work was not completed */}
        {workCompleted === false && (
          <View style={styles.section}>
            <Text style={styles.questionTitle}>Motivo*</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedReason}
                onValueChange={(itemValue) => setSelectedReason(itemValue)}
                style={styles.picker}
              >
                <Picker.Item label="Selecione um motivo" value="" />
                {reasons.map((reason, index) => (
                  <Picker.Item key={index} label={reason} value={reason} />
                ))}
              </Picker>
            </View>
          </View>
        )}

        {/* Additional Comments - Only show if work was not completed */}
        {workCompleted === false && (
          <View style={styles.section}>
            <Text style={styles.questionTitle}>Deseja falar mais sobre</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Digite aqui..."
              placeholderTextColor="#999"
              value={additionalComments}
              onChangeText={setAdditionalComments}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Action Button */}
        <TouchableOpacity 
          style={[styles.actionButton, !canProceed && styles.actionButtonDisabled]} 
          onPress={() => {
            console.log('🖱️ Botão clicado');
            console.log('canProceed atual:', canProceed);
            console.log('isLoading atual:', isLoading);
            console.log('disabled atual:', !canProceed || isLoading);
            handleFinish();
          }}
          disabled={!canProceed || isLoading}
        >
          <Text style={[styles.actionButtonText, !canProceed && styles.actionButtonTextDisabled]}>
            {isLoading ? 'Processando...' : (workCompleted === false ? 'Finalizar' : 'Próximo')}
          </Text>
        </TouchableOpacity>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

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
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    fontSize: RFValue(18),
    fontWeight: '600',
    color: 'white',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: RFValue(13),
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  photoAreaContainer: {
    alignItems: 'center',
  },
  photoContainer: {
    position: 'relative',
  },
  photoPreview: {
    width: 200,
    height: 250,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    resizeMode: 'contain',
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  takePhotoButton: {
    borderWidth: 2,
    borderColor: '#000000',
    borderStyle: 'dashed',
    borderRadius: 8,
    width: 200,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  takePhotoText: {
    marginTop: 8,
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#6b7280',
  },
  questionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 24,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#3b82f6',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: RFValue(14),
    color: '#374151',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: 'white',
  },
  picker: {
    height: 50,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: RFValue(14),
    color: '#374151',
    backgroundColor: 'white',
    minHeight: 100,
  },
  actionButton: {
    backgroundColor: '#E0ED54',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 24,
    alignItems: 'center',
    shadowColor: '#E0ED54',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  actionButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0.1,
  },
  actionButtonText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#000000',
  },
  actionButtonTextDisabled: {
    color: '#6b7280',
  },
  bottomSpacing: {
    height: 100,
  },
  bottomNavigationContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#3b82f6',
    marginTop: 16,
  },
});

export default PostServiceAuditScreen; 