import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RFValue } from 'react-native-responsive-fontsize';
import { WorkOrder, User } from '../types/workOrder';

interface OrderEvaluationScreenProps {
  workOrder: WorkOrder;
  user: User;
  onBackPress: () => void;
  onSaveEvaluation: (evaluationData: any) => void;
}

const OrderEvaluationScreen: React.FC<OrderEvaluationScreenProps> = ({
  workOrder,
  user,
  onBackPress,
  onSaveEvaluation,
}) => {
  const [photoRating, setPhotoRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [establishmentRating, setEstablishmentRating] = useState(0);
  const [clientApprovalRating, setClientApprovalRating] = useState(0);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [details, setDetails] = useState('');

  const renderStarRating = (
    rating: number,
    setRating: (rating: number) => void,
    maxStars: number = 10
  ) => {
    return (
      <View style={styles.starsContainer}>
        {Array.from({ length: maxStars }, (_, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => setRating(index + 1)}
            style={styles.starButton}
          >
            <Ionicons
              name={index < rating ? 'star' : 'star-outline'}
              size={24}
              color={index < rating ? '#FFD700' : '#D1D5DB'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const handleSave = async () => {
    if (photoRating === 0 || serviceRating === 0 || establishmentRating === 0 || 
        clientApprovalRating === 0 || feedbackRating === 0) {
      Alert.alert('Avaliação Incompleta', 'Por favor, avalie todos os critérios antes de continuar.');
      return;
    }

    const evaluationData = {
      ordem_servico_id: workOrder.id,
      avaliador: parseInt(user.id),
      fotos: photoRating,
      documentos: serviceRating,
      prazo: establishmentRating,
      aprovacao: clientApprovalRating,
      feedback: feedbackRating,
      comentario: details.trim() || null,
      dt_avaliacao: new Date().toISOString(),
    };

    onSaveEvaluation(evaluationData);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar backgroundColor="#3b82f6" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalhamento da avaliação</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Instruções */}
        <Text style={styles.instructions}>
          Por favor marque se itens que você julga estarem corretos na realização da ordem de serviço.
        </Text>

        {/* Avaliação: Adicionou as fotos corretamente */}
        <View style={styles.evaluationSection}>
          <Text style={styles.evaluationTitle}>Adicionou as fotos corretamente</Text>
          {renderStarRating(photoRating, setPhotoRating)}
        </View>

        {/* Avaliação: Documentou corretamente o serviço */}
        <View style={styles.evaluationSection}>
          <Text style={styles.evaluationTitle}>Documentou corretamente o serviço</Text>
          {renderStarRating(serviceRating, setServiceRating)}
        </View>

        {/* Avaliação: Realizou no prazo detalhes sobre o estabelecido */}
        <View style={styles.evaluationSection}>
          <Text style={styles.evaluationTitle}>Realizou no prazo detalhes sobre o estabelecido</Text>
          {renderStarRating(establishmentRating, setEstablishmentRating)}
        </View>

        {/* Avaliação: Aprovação do cliente */}
        <View style={styles.evaluationSection}>
          <Text style={styles.evaluationTitle}>Aprovação do cliente</Text>
          {renderStarRating(clientApprovalRating, setClientApprovalRating)}
        </View>

        {/* Avaliação: Feedback e comunicação claras */}
        <View style={styles.evaluationSection}>
          <Text style={styles.evaluationTitle}>Feedback e comunicação claras</Text>
          {renderStarRating(feedbackRating, setFeedbackRating)}
        </View>

        {/* Campo de detalhes */}
        <View style={styles.detailsSection}>
          <Text style={styles.detailsLabel}>Digite mais detalhes...</Text>
          <TextInput
            style={styles.detailsInput}
            multiline
            numberOfLines={4}
            value={details}
            onChangeText={setDetails}
            placeholder="Digite mais detalhes sobre a avaliação..."
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Botões */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={styles.evaluateButton} onPress={handleSave}>
            <Text style={styles.evaluateButtonText}>Avaliar ordem de serviço</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton2} onPress={onBackPress}>
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>

        {/* Espaço para o bottom navigation */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
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
    paddingTop: 16,
  },
  instructions: {
    fontSize: RFValue(14),
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  highlightText: {
    fontWeight: '600',
    color: '#3B82F6',
  },
  evaluationSection: {
    marginBottom: 24,
  },
  evaluationTitle: {
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  starButton: {
    padding: 2,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailsLabel: {
    fontSize: RFValue(14),
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 12,
  },
  detailsInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: RFValue(14),
    color: '#1F2937',
    backgroundColor: 'white',
    textAlignVertical: 'top',
    minHeight: 100,
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  evaluateButton: {
    backgroundColor: '#E0ED54',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  evaluateButtonText: {
    color: '#1F2937',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
  backButton2: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButtonText: {
    color: 'white',
    fontSize: RFValue(16),
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 100,
  },
});

export default OrderEvaluationScreen; 