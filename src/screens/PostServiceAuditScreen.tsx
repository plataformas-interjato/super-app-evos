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
import { checkNetworkConnection, savePhotoFinalOffline } from '../services/integratedOfflineService';
import imageCompressionService from '../services/imageCompressionService';

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

// Validação de Funcionalidade: Online - Confirmação usuario / Foto final - Trabalho realizado - Validado pelo usuário. Não alterar sem nova validação.
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
          console.log('✅ Auditoria final já existe - usuário pode continuar ou voltar');
          
          // CORREÇÃO: Não redirecionar automaticamente
          // O usuário deve ter controle sobre a navegação
          // Apenas continuar na tela normalmente
          setIsCheckingPhoto(false);
          return;
        }
      }
      
      console.log('📱 Foto final não existe - continuando na tela de auditoria');
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
  // Validação de Funcionalidade: Online - Confirmação usuario / Foto final - Trabalho realizado - Validado pelo usuário. Não alterar sem nova validação.

  const handleFinalPhoto = async () => {
    try {
      console.log('📸 DEBUG: Iniciando captura de foto final');
      
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1.0, // Máxima qualidade inicial para depois comprimir
      });

      if (!result.canceled && result.assets[0]) {
        const originalUri = result.assets[0].uri;
        console.log('📸 Foto final capturada, iniciando compressão...');
        
        let photoUriToSave = originalUri;
        
        try {
          // COMPRESSÃO INTELIGENTE
          const compressed = await imageCompressionService.compressImage(originalUri, 'final');
          
          console.log(`✅ Foto final comprimida: ${compressed.compressionRatio.toFixed(1)}% redução (${(compressed.originalSize/(1024*1024)).toFixed(2)}MB → ${(compressed.compressedSize/(1024*1024)).toFixed(2)}MB)`);
          
          photoUriToSave = compressed.uri;
          setFinalPhoto(compressed.uri);
          
        } catch (compressionError) {
          console.warn('⚠️ Erro na compressão da foto final, usando original:', compressionError);
          setFinalPhoto(originalUri);
        }
        
        // NOVO: Apenas salvar localmente para exibição, salvamento real será no handleFinish
        setFinalPhoto(photoUriToSave);
        console.log('✅ Foto final preparada para salvamento via sistema unificado');
        
      }
    } catch (error) {
      console.error('💥 DEBUG: Erro na função handleFinalPhoto:', error);
      Alert.alert(
        'Erro na Câmera',
        'Não foi possível tirar a foto. Verifique as permissões e tente novamente.'
      );
    }
  // Validação de Funcionalidade: Online - Confirmação usuario / Foto final - Trabalho realizado - Validado pelo usuário. Não alterar sem nova validação.
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

    console.log('🚀 DEBUG: Iniciando salvamento da auditoria final');
    setIsLoading(true);
    
    try {
      // SALVAR AUDITORIA FINAL NO SISTEMA UNIFICADO
      console.log('💾 [UNIFICADO] Salvando auditoria final no sistema unificado...');
      
      // Converter foto para base64
      let photoBase64 = finalPhoto;
      if (finalPhoto && !finalPhoto.startsWith('data:image/')) {
        const FileSystem = require('expo-file-system');
        const base64 = await FileSystem.readAsStringAsync(finalPhoto, { 
          encoding: FileSystem.EncodingType.Base64 
        });
        photoBase64 = `data:image/jpeg;base64,${base64}`;
      }

      // Importar e usar o sistema unificado
      const { default: unifiedOfflineDataService } = await import('../services/unifiedOfflineDataService');
      
      const result = await unifiedOfflineDataService.saveAuditoriaFinal(
        workOrder.id,
        user.id.toString(),
        photoBase64,
        workCompleted,
        selectedReason,
        additionalComments
      );
      
      if (result.success) {
        console.log('✅ [UNIFICADO] Auditoria final salva com sucesso');
        if (result.savedOffline) {
          console.log('📱 [UNIFICADO] Auditoria salva offline - será sincronizada quando houver conexão');
        }
      } else {
        console.error('❌ [UNIFICADO] Erro ao salvar auditoria final:', result.error);
        Alert.alert(
          'Erro',
          'Não foi possível salvar a auditoria. Tente novamente.'
        );
        return;
      }
      
      // Prosseguir com o fluxo normal
      if (!workCompleted) {
        console.log('🚀 DEBUG: Trabalho não realizado - indo direto para salvamento');
        onFinishAudit({ 
          workCompleted, 
          reason: selectedReason, 
          additionalComments, 
          skipPhotoCollection: true 
        });
      } else {
        console.log('🚀 DEBUG: Trabalho realizado - seguindo fluxo normal');
        onFinishAudit({ 
          workCompleted, 
          reason: selectedReason, 
          additionalComments 
        });
      }
      
    } catch (error) {
      console.error('💥 DEBUG: Erro ao finalizar auditoria:', error);
      Alert.alert(
        'Erro',
        'Erro ao finalizar auditoria. Tente novamente.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = workCompleted !== null && (workCompleted || selectedReason) && finalPhoto;

  // Tela de loading enquanto verifica foto final
  if (isCheckingPhoto) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Ionicons name="camera" size={48} color="#3b82f6" />
          <Text style={styles.loadingText}>Verificando foto final...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Auditoria pós serviço</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Validação de Funcionalidade: Online - Confirmação usuario / Foto final - Trabalho realizado - Validado pelo usuário. Não alterar sem nova validação. */}
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

        {/* Validação de Funcionalidade: Online - Confirmação usuario / Foto final - Trabalho realizado - Validado pelo usuário. Não alterar sem nova validação. */}
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

        {/* Validação de Funcionalidade: Online - Confirmação usuario / Foto final - Trabalho realizado - Validado pelo usuário. Não alterar sem nova validação. */}
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
    resizeMode: 'cover',
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