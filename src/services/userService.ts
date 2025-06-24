import { supabase } from './supabase';

export interface UpdateUserPhotoResult {
  success: boolean;
  error?: string;
  photoUrl?: string;
}

/**
 * Atualiza a foto de perfil do usuário no Supabase
 * @param userId ID do usuário
 * @param photoBase64 Foto em formato base64
 * @returns Resultado da operação
 */
export const updateUserPhoto = async (userId: string, photoBase64: string): Promise<UpdateUserPhotoResult> => {
  try {
    console.log('📸 Iniciando atualização da foto do usuário:', userId);

    // Validar se o base64 está no formato correto
    if (!photoBase64.startsWith('data:image/')) {
      return {
        success: false,
        error: 'Formato de imagem inválido. Use base64 com prefixo data:image/'
      };
    }

    // Atualizar a foto no banco de dados
    const { data, error } = await supabase
      .from('usuario')
      .update({ 
        url_foto: photoBase64,
        dt_edicao: new Date().toISOString()
      })
      .eq('id', parseInt(userId))
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao atualizar foto no Supabase:', error);
      return {
        success: false,
        error: `Erro ao salvar foto: ${error.message}`
      };
    }

    console.log('✅ Foto atualizada com sucesso no Supabase');

    return {
      success: true,
      photoUrl: photoBase64
    };

  } catch (error) {
    console.error('💥 Erro inesperado ao atualizar foto:', error);
    return {
      success: false,
      error: 'Erro inesperado ao atualizar foto. Tente novamente.'
    };
  }
};

/**
 * Busca informações atualizadas do usuário
 * @param userId ID do usuário
 * @returns Dados do usuário ou erro
 */
export const getUserInfo = async (userId: string) => {
  try {
    const { data: user, error } = await supabase
      .from('usuario')
      .select('*')
      .eq('id', parseInt(userId))
      .single();

    if (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return { data: null, error: error.message };
    }

    return { data: user, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar usuário:', error);
    return { data: null, error: 'Erro inesperado ao buscar dados do usuário' };
  }
}; 