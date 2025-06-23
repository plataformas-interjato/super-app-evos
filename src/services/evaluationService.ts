import { supabase } from './supabase';

export interface EvaluationData {
  ordem_servico_id: number;
  avaliador: number;
  fotos: number;
  documentos: number;
  prazo: number;
  aprovacao: number;
  feedback: number;
  comentario?: string | null;
  dt_avaliacao: string;
}

// Salvar avaliação na tabela avaliacao_os
export const saveEvaluation = async (evaluationData: EvaluationData): Promise<{ success: boolean; error: string | null }> => {
  try {
    console.log('💾 Salvando avaliação:', evaluationData);
    
    const { data, error } = await supabase
      .from('avaliacao_os')
      .insert([evaluationData])
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao salvar avaliação:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Avaliação salva com sucesso:', data);
    return { success: true, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao salvar avaliação:', error);
    return { success: false, error: 'Erro inesperado ao salvar avaliação' };
  }
};

// Verificar se uma ordem de serviço já foi avaliada
export const checkEvaluationExists = async (orderServiceId: number): Promise<{ exists: boolean; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('avaliacao_os')
      .select('id')
      .eq('ordem_servico_id', orderServiceId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ Erro ao verificar avaliação existente:', error);
      return { exists: false, error: error.message };
    }

    return { exists: !!data, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao verificar avaliação:', error);
    return { exists: false, error: 'Erro inesperado ao verificar avaliação' };
  }
};

// Buscar avaliação de uma ordem de serviço
export const getEvaluation = async (orderServiceId: number): Promise<{ data: EvaluationData | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('avaliacao_os')
      .select('*')
      .eq('ordem_servico_id', orderServiceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Erro ao buscar avaliação:', error);
      return { data: null, error: error.message };
    }

    return { data: data || null, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar avaliação:', error);
    return { data: null, error: 'Erro inesperado ao buscar avaliação' };
  }
}; 