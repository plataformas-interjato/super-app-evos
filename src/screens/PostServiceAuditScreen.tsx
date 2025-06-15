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
import { saveAuditoriaFinalOffline, savePhotoFinalOffline, checkNetworkConnection } from '../services/offlineService';
import { hasFinalPhoto } from '../services/auditService';

interface PostServiceAuditScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onFinishAudit: (auditData: AuditData) => void;
  onBackToServiceSteps?: () => void;
}

interface AuditData {
  workCompleted: boolean;
  reason?: string;
  additionalComments?: string;
  userPhoto?: string;
}

const PostServiceAuditScreen: React.FC<PostServiceAuditScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onFinishAudit,
  onBackToServiceSteps,
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
  }, []);

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

  const checkExistingFinalPhoto = async () => {
    try {
      setIsCheckingPhoto(true);
      
      // Timeout de 5 segundos para evitar travamento
      const timeoutPromise = new Promise<{ hasPhoto: boolean; error: string | null }>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na verificação')), 5000)
      );
      
      const checkPromise = hasFinalPhoto(workOrder.id);
      
      const { hasPhoto, error } = await Promise.race([checkPromise, timeoutPromise]);
      
      if (error) {
        console.warn('⚠️ Erro ao verificar foto final:', error);
        // Continua normalmente se houver erro
        setIsCheckingPhoto(false);
        return;
      }

      if (hasPhoto) {
        console.log('✅ Foto final já existe, voltando usando handleBackPress...');
        // Usar setTimeout para evitar problemas de navegação assíncrona
        setTimeout(() => {
          handleBackPress();
        }, 100);
        return;
      }

      // Não tem foto, continua na tela normalmente
      setIsCheckingPhoto(false);
    } catch (error) {
      console.error('💥 Erro inesperado ao verificar foto final (timeout ou erro de rede):', error);
      // Em caso de erro ou timeout, sempre continuar na tela normalmente
      setIsCheckingPhoto(false);
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
        setFinalPhoto(photoUri);

        // Salvar foto final usando o serviço offline
        try {
          const { success, error, savedOffline } = await savePhotoFinalOffline(
            workOrder.id,
            user.id,
            photoUri
          );

          if (success) {
            if (savedOffline) {
              // Verificar se está offline para mostrar o popup
              const isOnline = await checkNetworkConnection();
              
              if (!isOnline) {
                console.log('📱 App offline: mostrando popup de foto final salva localmente');
                Alert.alert(
                  'Foto Salva',
                  'Foto capturada e salva localmente. Será sincronizada automaticamente quando houver conexão com a internet.',
                  [{ text: 'OK' }]
                );
              } else {
                console.log('🌐 App online: foto final salva mas não mostrando popup');
              }
            } else {
              console.log('✅ Foto final salva online com sucesso');
            }
          } else {
            console.error('❌ Erro ao salvar foto final:', error);
            Alert.alert(
              'Erro',
              'Não foi possível salvar a foto. Tente novamente.'
            );
            setFinalPhoto(null); // Remove a foto se não conseguiu salvar
          }
        } catch (auditError) {
          console.error('💥 Erro inesperado ao salvar foto final:', auditError);
          Alert.alert(
            'Erro',
            'Erro inesperado ao salvar a foto. Tente novamente.'
          );
          setFinalPhoto(null);
        }
      }
    } catch (error) {
      console.error('💥 Erro na função handleFinalPhoto:', error);
      Alert.alert('Erro', 'Não foi possível tirar a foto. Tente novamente.');
    }
  };

  const handleFinish = async () => {
    console.log('🔄 handleFinish chamado');
    console.log('workCompleted:', workCompleted);
    console.log('selectedReason:', selectedReason);
    console.log('finalPhoto:', finalPhoto);
    console.log('canProceed:', canProceed);
    
    if (workCompleted === null) {
      console.log('❌ Erro: workCompleted é null');
      Alert.alert('Campo obrigatório', 'Por favor, informe se o trabalho foi realizado.');
      return;
    }

    if (!workCompleted && !selectedReason) {
      console.log('❌ Erro: trabalho não realizado e sem motivo');
      Alert.alert('Campo obrigatório', 'Por favor, selecione um motivo.');
      return;
    }

    if (!finalPhoto) {
      console.log('❌ Erro: sem foto final');
      Alert.alert('Foto obrigatória', 'Por favor, tire uma foto final para concluir a auditoria.');
      return;
    }

    console.log('✅ Todas as validações passaram, iniciando salvamento...');
    setIsLoading(true);
    
    try {
      console.log('📤 Chamando saveAuditoriaFinalOffline...');
      // Salvar auditoria final com foto
      const { success, error, savedOffline } = await saveAuditoriaFinalOffline(
        workOrder.id,
        user.id,
        finalPhoto,
        workCompleted,
        !workCompleted ? selectedReason : undefined,
        additionalComments.trim() || undefined
      );

      console.log('📥 Resultado do salvamento:', { success, error, savedOffline });

      if (success) {
        if (savedOffline) {
          // Verificar se está offline para mostrar o popup
          const isOnline = await checkNetworkConnection();
          
          if (!isOnline) {
            console.log('📱 App offline: mostrando popup de auditoria salva localmente');
            Alert.alert(
              'Auditoria Salva',
              'Auditoria salva localmente. Será sincronizada automaticamente quando houver conexão com a internet.',
              [{ text: 'OK', onPress: () => {
                console.log('🚀 Chamando onFinishAudit após popup offline');
                onFinishAudit({ workCompleted, reason: selectedReason, additionalComments });
              }}]
            );
          } else {
            console.log('🌐 App online: auditoria salva mas não mostrando popup');
            console.log('🚀 Chamando onFinishAudit diretamente');
            onFinishAudit({ workCompleted, reason: selectedReason, additionalComments });
          }
        } else {
          // Auditoria salva online com sucesso - ir direto para próxima tela sem popup
          console.log('✅ Auditoria salva online com sucesso - indo direto para próxima tela');
          console.log('🚀 Chamando onFinishAudit após salvamento online');
          onFinishAudit({ workCompleted, reason: selectedReason, additionalComments });
        }
      } else {
        console.log('❌ Erro no salvamento:', error);
        Alert.alert('Erro', error || 'Não foi possível salvar a auditoria. Tente novamente.');
      }
    } catch (error) {
      console.error('💥 Erro ao finalizar auditoria:', error);
      Alert.alert('Erro', 'Erro inesperado ao finalizar auditoria.');
    } finally {
      console.log('🏁 Finalizando handleFinish, setIsLoading(false)');
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
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
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
            console.log('🖱️ Botão Próximo clicado');
            console.log('canProceed atual:', canProceed);
            console.log('isLoading atual:', isLoading);
            console.log('disabled atual:', !canProceed || isLoading);
            handleFinish();
          }}
          disabled={!canProceed || isLoading}
        >
          <Text style={[styles.actionButtonText, !canProceed && styles.actionButtonTextDisabled]}>
            {isLoading ? 'Processando...' : 'Próximo'}
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
    color: '#1f2937',
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