import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { updateWorkOrderStatus } from './workOrderService';

export interface AuditoriaTecnico {
  id?: number;
  created_at?: string;
  dt_adicao?: string;
  dt_edicao?: string;
  motivo?: string;
  comentario?: string;
  foto_inicial?: string;
  foto_final?: string;
  auditor_id: number;
  ordem_servico_id: number;
  ativo?: number;
  trabalho_realizado?: number;
}

/**
 * Converte foto local para base64
 */
const convertPhotoToBase64 = async (photoUri: string): Promise<{ base64: string | null; error: string | null }> => {
  try {
    // Verificar se o URI é válido
    if (!photoUri || typeof photoUri !== 'string') {
      return { base64: null, error: 'URI da foto inválido' };
    }

    // Verificar se o arquivo existe
    const fileInfo = await FileSystem.getInfoAsync(photoUri);
    if (!fileInfo.exists) {
      return { base64: null, error: 'Arquivo de foto não encontrado' };
    }

    const base64 = await FileSystem.readAsStringAsync(photoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64) {
      return { base64: null, error: 'Falha ao converter foto para base64' };
    }

    // Adicionar prefix data URI para facilitar uso posterior
    const base64WithPrefix = `data:image/jpeg;base64,${base64}`;
    
    return { base64: base64WithPrefix, error: null };

  } catch (error) {
    console.error('💥 Erro ao converter foto para base64:', error);
    return { base64: null, error: `Erro inesperado ao converter foto: ${error}` };
  }
};

/**
 * Salva a foto de início na tabela auditoria_tecnico
 */
export const savePhotoInicio = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<{ data: AuditoriaTecnico | null; error: string | null }> => {
  try {
    console.log('📸 Salvando foto de início na auditoria...');
    console.log('OS ID:', workOrderId);
    console.log('Técnico ID:', technicoId);
    console.log('Photo URI Local:', photoUri);

    // Validações de entrada
    if (!workOrderId || workOrderId <= 0) {
      return { data: null, error: 'ID da ordem de serviço inválido' };
    }

    if (!technicoId || technicoId.trim() === '') {
      return { data: null, error: 'ID do técnico inválido' };
    }

    if (!photoUri || photoUri.trim() === '') {
      return { data: null, error: 'URI da foto não fornecido' };
    }

    // 1. Converter foto para base64
    const { base64, error: conversionError } = await convertPhotoToBase64(photoUri);

    if (conversionError || !base64) {
      console.error('❌ Falha na conversão para base64:', conversionError);
      return { 
        data: null, 
        error: `Erro na conversão da foto: ${conversionError}` 
      };
    }

    // 2. Salvar registro na tabela com base64
    const { data, error } = await supabase
      .from('auditoria_tecnico')
      .insert({
        ordem_servico_id: workOrderId,
        auditor_id: parseInt(technicoId),
        foto_inicial: base64, // Base64 da foto
        dt_adicao: new Date().toISOString(),
        ativo: 1,
        trabalho_realizado: 0,
      })
      .select('*')
      .single();

    if (error) {
      console.error('❌ Erro ao salvar registro na auditoria:', error);
      return { data: null, error: error.message };
    }

    console.log('✅ Foto de início salva com sucesso:', data?.id);
    
    // 3. Atualizar status da ordem de serviço para "em_progresso"
    console.log('🔄 Atualizando status da OS para "em_progresso"...');
    const { error: statusError } = await updateWorkOrderStatus(
      workOrderId.toString(), 
      'em_progresso'
    );
    
    if (statusError) {
      console.warn('⚠️ Erro ao atualizar status da OS:', statusError);
      // Não retornar erro aqui pois a foto foi salva com sucesso
      // O status pode ser atualizado manualmente se necessário
    } else {
      console.log('✅ Status da OS atualizado para "em_progresso"');
    }
    
    return { data, error: null };

  } catch (error) {
    console.error('💥 Erro inesperado ao salvar foto de início:', error);
    return { data: null, error: 'Erro inesperado ao salvar foto de início' };
  }
};

/**
 * Busca todas as auditorias de uma ordem de serviço
 */
export const getAuditoriasByWorkOrder = async (
  workOrderId: number
): Promise<{ data: AuditoriaTecnico[] | null; error: string | null }> => {
  try {
    const { data, error } = await supabase
      .from('auditoria_tecnico')
      .select('*')
      .eq('ordem_servico_id', workOrderId)
      .eq('ativo', 1)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar auditorias:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao buscar auditorias:', error);
    return { data: null, error: 'Erro inesperado ao buscar auditorias' };
  }
};

/**
 * Verifica se já existe foto inicial para uma ordem de serviço (online + offline)
 */
export const hasInitialPhoto = async (
  workOrderId: number
): Promise<{ hasPhoto: boolean; error: string | null }> => {
  try {
    console.log(`🔍 ===== VERIFICANDO FOTO INICIAL DA OS ${workOrderId} =====`);
    
    // Verificar conectividade primeiro
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    const isOnline = netInfo.isConnected === true && netInfo.isInternetReachable === true;
    console.log(`📶 Status de conexão: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (isOnline) {
      // ONLINE: Verificar servidor PRIMEIRO (fonte da verdade)
      console.log(`🌐 Verificando foto inicial no SERVIDOR...`);
      
      const { data, error } = await supabase
        .from('auditoria_tecnico')
        .select('id, foto_inicial')
        .eq('ordem_servico_id', workOrderId)
        .not('foto_inicial', 'is', null)
        .limit(1);

      if (error) {
        console.error(`❌ Erro ao verificar servidor:`, error);
        // Em caso de erro no servidor, verificar offline como fallback
        console.log(`📱 Fallback: verificando dados offline...`);
      } else {
        const hasServerPhoto = data && data.length > 0 && data[0].foto_inicial;
        console.log(`🌐 Resultado do servidor: ${hasServerPhoto ? 'FOTO ENCONTRADA' : 'SEM FOTO'}`);
        
        if (hasServerPhoto) {
          console.log(`✅ RESULTADO FINAL: FOTO INICIAL EXISTE NO SERVIDOR`);
          return { hasPhoto: true, error: null };
        } else {
          console.log(`❌ Servidor não tem foto - verificando dados offline não sincronizados...`);
        }
      }
      
      // Verificar dados offline não sincronizados
      try {
        const { getOfflineActions } = await import('./offlineService');
        const offlineActions = await getOfflineActions();
        console.log(`📱 Total de ações offline: ${offlineActions.length}`);
        
        const offlinePhotoActions = offlineActions.filter(action => 
          action.type === 'PHOTO_INICIO' && 
          action.workOrderId === workOrderId &&
          !action.synced // Importante: apenas não sincronizadas
        );
        
        console.log(`📱 Ações de foto inicial offline para OS ${workOrderId}: ${offlinePhotoActions.length}`);
        
        if (offlinePhotoActions.length > 0) {
          console.log(`✅ RESULTADO FINAL: FOTO INICIAL EXISTE OFFLINE (não sincronizada)`);
          offlinePhotoActions.forEach(action => {
            console.log(`   - Ação: ${action.id}, Synced: ${action.synced}, Tentativas: ${action.attempts}`);
          });
          return { hasPhoto: true, error: null };
        } else {
          console.log(`❌ RESULTADO FINAL: NÃO HÁ FOTO INICIAL (nem servidor nem offline)`);
          return { hasPhoto: false, error: null };
        }
      } catch (offlineError) {
        console.error(`❌ Erro ao verificar offline:`, offlineError);
        return { hasPhoto: false, error: null };
      }
      
    } else {
      // OFFLINE: Verificar apenas dados offline
      console.log(`📱 Verificando foto inicial OFFLINE...`);
      
      try {
        const { getOfflineActions } = await import('./offlineService');
        const offlineActions = await getOfflineActions();
        console.log(`📱 Total de ações offline: ${offlineActions.length}`);
        
        const hasOfflinePhoto = offlineActions.some(action => 
          action.type === 'PHOTO_INICIO' && 
          action.workOrderId === workOrderId
        );
        
        console.log(`📱 Resultado offline: ${hasOfflinePhoto ? 'FOTO ENCONTRADA' : 'SEM FOTO'}`);
        
        if (hasOfflinePhoto) {
          console.log(`✅ RESULTADO FINAL: FOTO INICIAL EXISTE OFFLINE`);
          return { hasPhoto: true, error: null };
        } else {
          console.log(`❌ RESULTADO FINAL: NÃO HÁ FOTO INICIAL OFFLINE`);
          return { hasPhoto: false, error: null };
        }
      } catch (offlineError) {
        console.error(`❌ Erro ao verificar dados offline:`, offlineError);
        return { hasPhoto: false, error: null };
      }
    }
  } catch (error) {
    console.error(`💥 Erro crítico ao verificar foto inicial:`, error);
    return { hasPhoto: false, error: 'Erro inesperado ao verificar foto inicial' };
  }
};

/**
 * Verifica se já existe foto final para uma ordem de serviço (online + offline)
 */
export const hasFinalPhoto = async (
  workOrderId: number
): Promise<{ hasPhoto: boolean; error: string | null }> => {
  try {
    // Verificar conectividade primeiro
    const NetInfo = require('@react-native-community/netinfo');
    const netInfo = await NetInfo.fetch();
    
    // Se offline, verificar dados offline primeiro
    if (!netInfo.isConnected) {
      try {
        console.log('📱 Offline - verificando foto final no AsyncStorage...');
        
        // Verificar no AsyncStorage das ações offline
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const offlineActionsStr = await AsyncStorage.getItem('offline_actions');
        
        if (offlineActionsStr) {
          const offlineActions = JSON.parse(offlineActionsStr);
          
          // Procurar por ação de foto final para esta OS
          const hasOfflinePhoto = Object.values(offlineActions).some((action: any) => 
            (action.type === 'PHOTO_FINAL' || action.type === 'AUDITORIA_FINAL') && 
            action.workOrderId === workOrderId
          );
          
          if (hasOfflinePhoto) {
            console.log('✅ Foto final encontrada no AsyncStorage offline');
            return { hasPhoto: true, error: null };
          }
        }
        
        console.log('❌ Foto final não encontrada offline');
        return { hasPhoto: false, error: null };
      } catch (offlineError) {
        console.error('💥 Erro ao verificar offline:', offlineError);
        return { hasPhoto: false, error: null };
      }
    }
    
    // Se online, verificar no servidor E também no AsyncStorage (pode ter dados não sincronizados)
    console.log('🌐 Online - verificando foto final no servidor e AsyncStorage...');
    
    // Primeiro verificar AsyncStorage (dados mais recentes)
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const offlineActionsStr = await AsyncStorage.getItem('offline_actions');
      
      if (offlineActionsStr) {
        const offlineActions = JSON.parse(offlineActionsStr);
        
        const hasOfflinePhoto = Object.values(offlineActions).some((action: any) => 
          (action.type === 'PHOTO_FINAL' || action.type === 'AUDITORIA_FINAL') && 
          action.workOrderId === workOrderId
        );
        
        if (hasOfflinePhoto) {
          console.log('✅ Foto final encontrada no AsyncStorage (mesmo online)');
          return { hasPhoto: true, error: null };
        }
      }
    } catch (asyncStorageError) {
      console.warn('⚠️ Erro ao verificar AsyncStorage:', asyncStorageError);
    }
    
    // Verificar no servidor
    const { data, error } = await supabase
      .from('auditoria_tecnico')
      .select('id, foto_final')
      .eq('ordem_servico_id', workOrderId)
      .not('foto_final', 'is', null)
      .limit(1);

    if (error) {
      console.error('❌ Erro ao verificar no servidor:', error);
      return { hasPhoto: false, error: error.message };
    }

    const hasPhoto = data && data.length > 0 && data[0].foto_final;
    
    if (hasPhoto) {
      console.log('✅ Foto final encontrada no servidor');
    } else {
      console.log('❌ Foto final não encontrada no servidor');
    }
    
    return { hasPhoto: !!hasPhoto, error: null };
  } catch (error) {
    console.error('💥 Erro inesperado ao verificar foto final:', error);
    return { hasPhoto: false, error: 'Erro inesperado ao verificar foto final' };
  }
};

/**
 * Salva a auditoria final (foto final + dados da auditoria)
 */
export const saveAuditoriaFinal = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string,
  trabalhoRealizado: boolean,
  motivo?: string,
  comentario?: string
): Promise<{ data: AuditoriaTecnico | null; error: string | null }> => {
  try {
    console.log('📸 Salvando auditoria final...');

    // Validações de entrada
    if (!workOrderId || workOrderId <= 0) {
      return { data: null, error: 'ID da ordem de serviço inválido' };
    }

    if (!technicoId || technicoId.trim() === '') {
      return { data: null, error: 'ID do técnico inválido' };
    }

    if (!photoUri || photoUri.trim() === '') {
      return { data: null, error: 'URI da foto não fornecido' };
    }

    if (typeof trabalhoRealizado !== 'boolean') {
      return { data: null, error: 'Valor de trabalho realizado inválido' };
    }

    // 1. Converter foto para base64
    const { base64, error: conversionError } = await convertPhotoToBase64(photoUri);

    if (conversionError || !base64) {
      console.error('❌ Falha na conversão para base64:', conversionError);
      return { 
        data: null, 
        error: `Erro na conversão da foto: ${conversionError}` 
      };
    }

    // 2. Buscar registro existente da auditoria (criado na foto inicial)
    const { data: existingAudit, error: searchError } = await supabase
      .from('auditoria_tecnico')
      .select('*')
      .eq('ordem_servico_id', workOrderId)
      .eq('auditor_id', parseInt(technicoId))
      .eq('ativo', 1)
      .single();

    let auditData: AuditoriaTecnico | null = null;

    if (searchError || !existingAudit) {
      console.log('⚠️ Registro de auditoria não encontrado, criando novo...');
      
      // Se não existe registro, criar um novo com a foto final
      const { data: newAudit, error: createError } = await supabase
        .from('auditoria_tecnico')
        .insert({
          ordem_servico_id: workOrderId,
          auditor_id: parseInt(technicoId),
          foto_final: base64,
          trabalho_realizado: trabalhoRealizado ? 1 : 0,
          motivo: motivo || null,
          comentario: comentario || null,
          dt_adicao: new Date().toISOString(),
          dt_edicao: new Date().toISOString(),
          ativo: 1,
        })
        .select('*')
        .single();

      if (createError) {
        console.error('❌ Erro ao criar novo registro de auditoria:', createError);
        return { data: null, error: createError.message };
      }

      auditData = newAudit;
      console.log('✅ Novo registro de auditoria criado com sucesso');
    } else {
      // 3. Atualizar registro existente com dados finais
      const { data: updatedAudit, error: updateError } = await supabase
        .from('auditoria_tecnico')
        .update({
          foto_final: base64,
          trabalho_realizado: trabalhoRealizado ? 1 : 0,
          motivo: motivo || null,
          comentario: comentario || null,
          dt_edicao: new Date().toISOString(),
        })
        .eq('id', existingAudit.id)
        .select('*')
        .single();

      if (updateError) {
        console.error('❌ Erro ao atualizar auditoria:', updateError);
        return { data: null, error: updateError.message };
      }

      auditData = updatedAudit;
      console.log('✅ Registro de auditoria atualizado com sucesso');
    }

    console.log('✅ Auditoria final salva com sucesso');
    
    // REMOVIDO: Não finalizar a OS aqui - deve ser finalizada apenas na tela final
    // A finalização será feita no handleFinishAuditSaving após o loading screen
    // const { error: statusError } = await updateWorkOrderStatus(
    //   workOrderId.toString(), 
    //   'finalizada'
    // );
    // 
    // if (statusError) {
    //   console.warn('⚠️ Erro ao finalizar OS:', statusError);
    // } else {
    //   console.log('✅ Ordem de serviço finalizada automaticamente');
    // }
    
    return { data: auditData, error: null };

  } catch (error) {
    console.error('💥 Erro inesperado ao salvar auditoria final:', error);
    return { data: null, error: 'Erro inesperado ao salvar auditoria final' };
  }
}; 