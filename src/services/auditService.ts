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

// Validação de Funcionalidade: Foto inicial - Inserir/atualizar na mesma linha por OS (ordem_servico_id + auditor_id). Validado pelo usuário. Não alterar sem nova validação.
export const savePhotoInicio = async (
  workOrderId: number,
  technicoId: string,
  photoValue: string
): Promise<{ data: AuditoriaTecnico | null; error: string | null }> => {
  try {
    console.log('📸 Salvando foto de início na auditoria...');
    console.log('OS ID:', workOrderId);
    console.log('Técnico ID:', technicoId);
    console.log('Photo Value:', photoValue.substring(0, 50) + '...');

    // Validações de entrada
    if (!workOrderId || workOrderId <= 0) {
      return { data: null, error: 'ID da ordem de serviço inválido' };
    }

    if (!technicoId || technicoId.trim() === '') {
      return { data: null, error: 'ID do técnico inválido' };
    }

    if (!photoValue || photoValue.trim() === '') {
      return { data: null, error: 'Valor da foto não fornecido' };
    }

    let base64ToSave: string;

    // Verificar se já é base64 ou se precisa converter
    if (photoValue.startsWith('data:image/')) {
      // Já é base64 completo, usar diretamente
      base64ToSave = photoValue;
      console.log('📸 Usando base64 fornecido diretamente');
    } else if (photoValue.startsWith('file://')) {
      // É um URI, precisa converter
      console.log('📸 Convertendo URI para base64...');
      const { base64, error: conversionError } = await convertPhotoToBase64(photoValue);

      if (conversionError || !base64) {
        console.error('❌ Falha na conversão para base64:', conversionError);
        return { 
          data: null, 
          error: `Erro na conversão da foto: ${conversionError}` 
        };
      }

      base64ToSave = base64;
    } else {
      // Assumir que é base64 puro e adicionar prefixo se necessário
      base64ToSave = photoValue.startsWith('data:') ? photoValue : `data:image/jpeg;base64,${photoValue}`;
      console.log('📸 Adicionando prefixo ao base64 puro');
    }

    // Verificar se já existe linha para esta OS + técnico
    const { data: existingAudit, error: searchError } = await supabase
      .from('auditoria_tecnico')
      .select('*')
      .eq('ordem_servico_id', workOrderId)
      .eq('auditor_id', parseInt(technicoId))
      .eq('ativo', 1)
      .single();

    let resultData: AuditoriaTecnico | null = null;

    if (searchError && searchError.code === 'PGRST116') {
      // Não existe: inserir novo com foto_inicial
      const { data, error } = await supabase
        .from('auditoria_tecnico')
        .insert({
          ordem_servico_id: workOrderId,
          auditor_id: parseInt(technicoId),
          foto_inicial: base64ToSave,
          trabalho_realizado: 0,
          dt_adicao: new Date().toISOString(),
          ativo: 1,
        })
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao salvar registro na auditoria:', error);
        return { data: null, error: error.message };
      }

      resultData = data;
    } else if (existingAudit) {
      // Existe: atualizar apenas foto_inicial
      const { data, error } = await supabase
        .from('auditoria_tecnico')
        .update({
          foto_inicial: base64ToSave,
          dt_edicao: new Date().toISOString(),
        })
        .eq('id', existingAudit.id)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar foto inicial:', error);
        return { data: null, error: error.message };
      }

      resultData = data;
    } else if (searchError) {
      console.error('❌ Erro inesperado ao buscar auditoria inicial:', searchError);
      return { data: null, error: searchError.message };
    }

    console.log('✅ Foto de início salva/atualizada com sucesso:', resultData?.id);
    
    // Atualizar status da ordem de serviço para "em_progresso"
    console.log('🔄 Atualizando status da OS para "em_progresso"...');
    const { updateWorkOrderStatus } = await import('./workOrderService');
    const { error: statusError } = await updateWorkOrderStatus(workOrderId, 'em_progresso');
    if (statusError) {
      console.warn('⚠️ Erro ao atualizar status da OS:', statusError);
    }

    return { data: resultData, error: null };

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
 * Verifica se já existe foto inicial para uma ordem de serviço (online + offline + sistema seguro)
 */
export const hasInitialPhoto = async (
  workOrderId: number
): Promise<{ hasPhoto: boolean; error: string | null }> => {
  try {
    console.log(`🔍 ===== VERIFICANDO FOTO INICIAL DA OS ${workOrderId} =====`);
    
    // NOVO: Verificar primeiro no sistema seguro (prioritário)
    console.log(`🔒 Verificando foto inicial no SISTEMA SEGURO...`);
    try {
      const { getPhotoSystemDiagnostics } = await import('./integratedOfflineService');
      const securePhotoStorage = (await import('./securePhotoStorageService')).default;
      
      // Buscar fotos da OS no sistema seguro
      const securePhotos = await securePhotoStorage.getPhotosByWorkOrder(workOrderId);
      const hasSecureInitialPhoto = securePhotos.some(photo => photo.type === 'PHOTO_INICIO');
      
      console.log(`🔒 Fotos seguras encontradas: ${securePhotos.length}`);
      console.log(`🔒 Foto inicial segura: ${hasSecureInitialPhoto ? 'ENCONTRADA' : 'NÃO ENCONTRADA'}`);
      
      if (hasSecureInitialPhoto) {
        console.log(`✅ RESULTADO FINAL: FOTO INICIAL EXISTE NO SISTEMA SEGURO`);
        return { hasPhoto: true, error: null };
      }
    } catch (secureError) {
      console.warn(`⚠️ Erro ao verificar sistema seguro (continuando com verificação legada):`, secureError);
    }
    
    // Verificar conectividade
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
      
      // Verificar dados offline não sincronizados (sistema legado)
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
 * Verifica se já existe foto final para uma ordem de serviço (online + offline + sistema seguro)
 */
export const hasFinalPhoto = async (
  workOrderId: number
): Promise<{ hasPhoto: boolean; error: string | null }> => {
  try {
    console.log(`🔍 ===== VERIFICANDO FOTO FINAL DA OS ${workOrderId} =====`);
    
    // NOVO: Verificar primeiro no sistema seguro (prioritário)
    console.log(`🔒 Verificando foto final no SISTEMA SEGURO...`);
    try {
      const securePhotoStorage = (await import('./securePhotoStorageService')).default;
      
      // Buscar fotos da OS no sistema seguro
      const securePhotos = await securePhotoStorage.getPhotosByWorkOrder(workOrderId);
      const hasSecureFinalPhoto = securePhotos.some(photo => photo.type === 'PHOTO_FINAL' || photo.type === 'AUDITORIA');
      
      console.log(`🔒 Fotos seguras encontradas: ${securePhotos.length}`);
      console.log(`🔒 Foto final segura: ${hasSecureFinalPhoto ? 'ENCONTRADA' : 'NÃO ENCONTRADA'}`);
      
      if (hasSecureFinalPhoto) {
        console.log(`✅ RESULTADO FINAL: FOTO FINAL EXISTE NO SISTEMA SEGURO`);
        return { hasPhoto: true, error: null };
      }
    } catch (secureError) {
      console.warn(`⚠️ Erro ao verificar sistema seguro (continuando com verificação legada):`, secureError);
    }
    
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

// Validação de Funcionalidade: Foto final - Sincronizar somente ao avançar e gravar na mesma linha da foto inicial (ordem_servico_id + auditor_id). Validado pelo usuário. Não alterar sem nova validação.
export const saveAuditoriaFinal = async (
  workOrderId: number,
  technicoId: string,
  photoValue: string,
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

    if (!photoValue || photoValue.trim() === '') {
      return { data: null, error: 'Valor da foto não fornecido' };
    }

    if (typeof trabalhoRealizado !== 'boolean') {
      return { data: null, error: 'Valor de trabalho realizado inválido' };
    }

    let base64ToSave: string;

    // Verificar se já é base64 ou se precisa converter
    if (photoValue.startsWith('data:image/')) {
      // Já é base64 completo, usar diretamente
      base64ToSave = photoValue;
      console.log('📸 Usando base64 fornecido diretamente');
    } else if (photoValue.startsWith('file://')) {
      // É um URI, precisa converter
      console.log('📸 Convertendo URI para base64...');
      const { base64, error: conversionError } = await convertPhotoToBase64(photoValue);

      if (conversionError || !base64) {
        console.error('❌ Falha na conversão para base64:', conversionError);
        return { 
          data: null, 
          error: `Erro na conversão da foto: ${conversionError}` 
        };
      }

      base64ToSave = base64;
    } else {
      // Assumir que é base64 puro e adicionar prefixo se necessário
      base64ToSave = photoValue.startsWith('data:') ? photoValue : `data:image/jpeg;base64,${photoValue}`;
      console.log('📸 Adicionando prefixo ao base64 puro');
    }

    // Buscar registro existente da auditoria (criado na foto inicial)
    const { data: existingAudit, error: searchError } = await supabase
      .from('auditoria_tecnico')
      .select('*')
      .eq('ordem_servico_id', workOrderId)
      .eq('auditor_id', parseInt(technicoId))
      .eq('ativo', 1)
      .single();

    let auditData: AuditoriaTecnico | null = null;

    if (searchError && searchError.code === 'PGRST116') {
      // Não encontrou registro existente, criar novo
      console.log('📝 Criando novo registro de auditoria final...');
      
      const { data: newData, error: insertError } = await supabase
        .from('auditoria_tecnico')
        .insert({
          ordem_servico_id: workOrderId,
          auditor_id: parseInt(technicoId),
          foto_final: base64ToSave,
          trabalho_realizado: trabalhoRealizado ? 1 : 0,
          motivo: motivo || '',
          comentario: comentario || '',
          dt_adicao: new Date().toISOString(),
          ativo: 1,
        })
        .select('*')
        .single();

      if (insertError) {
        console.error('❌ Erro ao criar registro de auditoria final:', insertError);
        return { data: null, error: insertError.message };
      }

      auditData = newData;
    } else if (existingAudit) {
      // Atualizar registro existente
      console.log('🔄 Atualizando registro existente de auditoria final...');
      
      const { data: updatedData, error: updateError } = await supabase
        .from('auditoria_tecnico')
        .update({
          foto_final: base64ToSave,
          trabalho_realizado: trabalhoRealizado ? 1 : 0,
          motivo: motivo || '',
          comentario: comentario || '',
          dt_edicao: new Date().toISOString(),
        })
        .eq('id', existingAudit.id)
        .select('*')
        .single();

      if (updateError) {
        console.error('❌ Erro ao atualizar registro de auditoria final:', updateError);
        return { data: null, error: updateError.message };
      }

      auditData = updatedData;
    } else {
      console.error('❌ Erro inesperado ao buscar auditoria:', searchError);
      return { data: null, error: searchError?.message || 'Erro inesperado' };
    }

    console.log('✅ Auditoria final salva com sucesso:', auditData?.id);
 
    return { data: auditData, error: null };

  } catch (error) {
    console.error('💥 Erro inesperado ao salvar auditoria final:', error);
    return { data: null, error: 'Erro inesperado ao salvar auditoria final' };
  }
}; 