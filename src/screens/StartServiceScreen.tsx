import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import * as ImagePicker from 'expo-image-picker';
import { WorkOrder, User } from '../types/workOrder';
import BottomNavigation from '../components/BottomNavigation';
import { checkNetworkConnection, savePhotoInicioOffline } from '../services/integratedOfflineService';
import imageCompressionService from '../services/imageCompressionService';
import { hasInitialPhoto } from '../services/auditService';

interface StartServiceScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onTabPress: (tab: 'home' | 'profile') => void;
  onConfirmStart: (photo?: string) => void;
}

const { width } = Dimensions.get('window');
// Validação de Funcionalidade: Online - Foto inicial do técnico - Validado pelo usuário. Não alterar sem nova validação.
const StartServiceScreen: React.FC<StartServiceScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onTabPress,
  onConfirmStart,
}) => {
  const [photo, setPhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingPhoto, setIsCheckingPhoto] = useState(true);

  // Verificações de segurança
  if (!workOrder || !user) {
    console.error('❌ Dados obrigatórios não fornecidos:', { workOrder: !!workOrder, user: !!user });
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Erro: Dados não disponíveis</Text>
        </View>
      </SafeAreaView>
    );
  }

  useEffect(() => {
    checkExistingPhoto();
  }, []);

  const checkExistingPhoto = async () => {
    try {
      setIsCheckingPhoto(true);
      
      // Timeout de 5 segundos para evitar travamento
      const timeoutPromise = new Promise<{ hasPhoto: boolean; error: string | null }>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na verificação')), 5000)
      );
      
      const checkPromise = hasInitialPhoto(workOrder.id);
      
      const { hasPhoto, error } = await Promise.race([checkPromise, timeoutPromise]);
      
      if (error) {
        console.warn('⚠️ Erro ao verificar foto inicial:', error);
        // Continua normalmente se houver erro
        setIsCheckingPhoto(false);
        return;
      }

      if (hasPhoto) {
        console.log('✅ Foto inicial já existe, pulando tela...');
        // Usar setTimeout para evitar problemas de navegação assíncrona
        setTimeout(() => {
          onConfirmStart(undefined);
        }, 100);
        return;
      }

      // Não tem foto, continua na tela normalmente
      setIsCheckingPhoto(false);
    } catch (error) {
      console.error('💥 Erro inesperado ao verificar foto (timeout ou erro de rede):', error);
      // Em caso de erro ou timeout, sempre continuar na tela normalmente
      setIsCheckingPhoto(false);
    }
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permissão Necessária',
        'É necessário permitir o acesso à câmera para tirar fotos.'
      );
      return false;
    }
    return true;
  };

  // Validação de Funcionalidade: Tirar a foto do usuário - Validado pelo usuário. Não alterar sem nova validação.
  const takePhoto = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1.0, // Máxima qualidade inicial para depois comprimir
      });

      if (!result.canceled && result.assets[0]) {
        const originalUri = result.assets[0].uri;
        console.log('📸 Foto inicial capturada, iniciando compressão...');
        
        let photoUriToSave = originalUri;
        
        try {
          // COMPRESSÃO INTELIGENTE
          const compressed = await imageCompressionService.compressImage(originalUri, 'inicial');
          
          console.log(`✅ Foto inicial comprimida: ${compressed.compressionRatio.toFixed(1)}% redução (${(compressed.originalSize/(1024*1024)).toFixed(2)}MB → ${(compressed.compressedSize/(1024*1024)).toFixed(2)}MB)`);
          
          // Usar URI comprimida
          photoUriToSave = compressed.uri;
          setPhoto(compressed.uri);
          
        } catch (compressionError) {
          console.warn('⚠️ Erro na compressão, usando foto original:', compressionError);
          setPhoto(originalUri);
        }

        // Salvar foto usando o serviço offline
        try {
          // Validação de Funcionalidade: Foto inicial - Salva localmente (FileSystem) e NÃO sincroniza aqui; sincroniza somente ao avançar de página. Validado pelo usuário. Não alterar sem nova validação.
          const { success, error, savedOffline } = await savePhotoInicioOffline(
            workOrder.id,
            user.id,
            photoUriToSave
          );

          if (success) {
            if (savedOffline) {
              // Verificar se está offline para mostrar o popup
              const isOnline = await checkNetworkConnection();
              
              if (!isOnline) {
                console.log('📱 App offline: mostrando popup de foto salva localmente');
                Alert.alert(
                  'Foto Salva',
                  'Foto capturada e salva localmente. Será sincronizada automaticamente quando houver conexão com a internet.',
                  [{ text: 'OK' }]
                );
              } else {
                console.log('🌐 App online: foto salva mas não mostrando popup');
              }
            } else {
              console.log('✅ Foto salva online com sucesso');
            }
          } else {
            console.error('❌ Erro ao salvar foto:', error);
            Alert.alert(
              'Erro',
              'Não foi possível salvar a foto. Tente novamente.'
            );
            setPhoto(null); // Remove a foto se não conseguiu salvar
          }
        } catch (auditError) {
          console.error('💥 Erro inesperado ao salvar foto:', auditError);
          Alert.alert(
            'Erro',
            'Erro inesperado ao salvar a foto. Tente novamente.'
          );
          setPhoto(null);
        }
      }
    } catch (error) {
      console.error('💥 Erro ao tirar foto inicial:', error);
      Alert.alert(
        'Erro na Câmera',
        'Não foi possível tirar a foto. Verifique as permissões e tente novamente.',
        [{ text: 'OK' }]
      );
    }
  };
  // Validação de Funcionalidade: Remover a foto tirada - Validado pelo usuário. Não alterar sem nova validação.

  const removePhoto = () => {
    Alert.alert(
      'Remover Foto',
      'Deseja remover a foto? (A foto será mantida no histórico do sistema)',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Remover', 
          onPress: () => {
            // Remove apenas do app, mantém na base de dados e cache offline
            setPhoto(null);
            console.log('📱 Foto removida do app (mantida no histórico)');
          }
        },
      ]
    );
  };

  // Validação de Funcionalidade: Online - Foto inicial do técnico - Validado pelo usuário. Não alterar sem nova validação.
  const handleConfirmStart = async () => {
    console.log('🔥 StartServiceScreen - handleConfirmStart iniciado');
    console.log('📷 Foto disponível:', photo ? 'Sim' : 'Não');
    console.log('👤 Usuário:', user?.name);
    console.log('📋 Ordem de serviço:', workOrder?.id);
    console.log('🔧 onConfirmStart função:', typeof onConfirmStart);
    
    // Verificar se há foto antes de prosseguir
    if (!photo) {
      console.log('❌ Sem foto - mostrando alerta');
      Alert.alert(
        'Foto Obrigatória',
        'É necessário tirar uma foto para confirmar o início da ordem de serviço.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('⏳ Iniciando loading...');
    setIsLoading(true);
    try {
      console.log('🚀 Chamando onConfirmStart com foto...');
      await onConfirmStart(photo || undefined);
      console.log('✅ onConfirmStart executado com sucesso');
    } catch (error) {
      console.error('❌ Erro no handleConfirmStart do StartServiceScreen:', error);
      if (error instanceof Error) {
        console.error('❌ Stack trace:', error.stack);
      }
      Alert.alert('Erro', 'Não foi possível iniciar a ordem de serviço.');
    } finally {
      console.log('🔚 Finalizando loading...');
      setIsLoading(false);
    }
  };

  // Tela de loading enquanto verifica foto inicial
  if (isCheckingPhoto) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Ionicons name="camera" size={48} color="#3b82f6" />
          <Text style={styles.loadingText}>Verificando foto inicial...</Text>
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
        <Text style={styles.headerTitle}>Iniciar Ordem de Serviço</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Confirmação do Usuário - Movido para o primeiro card */}
        <View style={styles.orderInfoCard}>
          <Text style={styles.sectionTitle}>Confirmação do Técnico</Text>
          
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              {user.url_foto ? (
                <Image source={{ uri: user.url_foto }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={32} color="#666" />
              )}
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userRole}>{user.role}</Text>
            </View>
            <View style={styles.confirmationIcon}>
              <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            </View>
          </View>
          
          <Text style={styles.securityText}>
            Por motivos de segurança, confirme sua identidade antes de iniciar a ordem de serviço.
          </Text>
        </View>

        {/* Seção de Foto - Sem container */}
        <Text style={styles.photoSectionTitle}>Foto de Início</Text>
        <Text style={styles.photoSectionSubtitle}>
          Tire uma foto para registrar o início da atividade
        </Text>
        {/* Validação de Funcionalidade: Exibir foto tirada - Largura e modo de exibição ajustados para mesmo tamanho do input - Validado pelo usuário. Não alterar sem nova validação. */}
        
        <View style={styles.photoAreaContainer}>
          {photo ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photo }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.removePhotoButton} onPress={removePhoto}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.takePhotoButton} onPress={takePhoto}>
              <Ionicons name="camera" size={32} color="#666" />
              <Text style={styles.takePhotoText}>Tirar Foto</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Botão de Confirmar */}
        {/* Validação de Funcionalidade: Online - Foto inicial do técnico - Validado pelo usuário. Não alterar sem nova validação. */}
        <TouchableOpacity 
          style={[
            styles.confirmButton, 
            (isLoading || !photo) && styles.confirmButtonDisabled
          ]} 
          onPress={handleConfirmStart}
          disabled={isLoading || !photo}
        >
          <Text style={[
            styles.confirmButtonText,
            !photo && styles.confirmButtonTextDisabled
          ]}>
            {isLoading ? 'Iniciando...' : 
             !photo ? 'Tire uma foto para continuar' :
             'Confirmar Início da Ordem de Serviço'}
          </Text>
        </TouchableOpacity>

        {/* Espaço para o bottom navigation */}
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
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    marginRight: 16,
    padding: 4,
  },
  headerTitle: {
    color: 'white',
    fontSize: RFValue(18),
    fontWeight: '600',
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  orderInfoCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  userDetails: {
    flex: 1,
    marginLeft: 16,
  },
  userName: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
  },
  userRole: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginTop: 2,
  },
  confirmationIcon: {
    marginLeft: 8,
  },
  securityText: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  photoSectionTitle: {
    fontSize: RFValue(16),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    marginTop: 24,
    textAlign: 'center',
  },
  photoSectionSubtitle: {
    fontSize: RFValue(13),
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  photoAreaContainer: {
    alignItems: 'center',
  },
  photoContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  photoPreview: {
    width: 200, // Largura original do input
    height: 250,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    resizeMode: 'cover', // Foto ocupa todo o espaço disponível
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
    borderRadius: 12,
    width: 200, // Largura original do input
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  takePhotoText: {
    marginTop: 8,
    fontSize: RFValue(14),
    color: '#6b7280',
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: '#E0ED54',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#1f2937',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
  confirmButtonTextDisabled: {
    color: '#9ca3af',
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
    color: '#1f2937',
    marginTop: 16,
  },
});

export default StartServiceScreen; 