import NetInfo from '@react-native-community/netinfo';
import secureDataStorage from './secureDataStorageService';
import { saveComentarioEtapa, saveDadosRecord } from './serviceStepsService';
import { supabase } from './supabase';
import securePhotoStorage from './securePhotoStorageService';

/**
 * SERVIÇO UNIFICADO DE DADOS OFFLINE
 * 
 * Salva TODOS os dados (comentários, entradas, fotos) no FileSystem
 * SEM AsyncStorage híbrido - 100% FileSystem
 */

export interface OfflineUserAction {
  id: string;
  type: 'COMENTARIO_ETAPA' | 'DADOS_RECORD' | 'ENTRADA_DADOS' | 'AUDITORIA_FINAL';
  timestamp: string;
  workOrderId: number;
  technicoId: string;
  data: any;
  synced: boolean;
  attempts: number;
}

export interface OfflineUserData {
  comentarios: OfflineUserAction[];
  dadosRecords: OfflineUserAction[];
  entradaDados: OfflineUserAction[];
  auditorias: OfflineUserAction[];
}

class UnifiedOfflineDataService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await secureDataStorage.initialize();
    this.initialized = true;
    console.log('✅ [UNIFIED-OFFLINE] Serviço unificado inicializado');
  }

  /**
   * SALVAR COMENTÁRIO DA ETAPA (FileSystem)
   */
  // Validação de Funcionalidade: Comentário por etapa - Salva no FileSystem e sincroniza com o Supabase pelo serviço unificado. Validado pelo usuário. Não alterar sem nova validação.
  async saveComentarioEtapa(
    workOrderId: number,
    technicoId: string,
    etapaId: number,
    comentario: string
  ): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> {
    
    await this.initialize();
    const actionId = `comentario_etapa_${workOrderId}_${etapaId}_${Date.now()}`;
    
    try {
      console.log(`💾 [UNIFIED-OFFLINE] Salvando comentário da etapa ${etapaId}...`);
      
      // 1. Criar ação offline
      const offlineAction: OfflineUserAction = {
        id: actionId,
        type: 'COMENTARIO_ETAPA',
        timestamp: new Date().toISOString(),
        workOrderId,
        technicoId,
        data: {
          etapaId,
          comentario,
        },
        synced: false,
        attempts: 0
      };

      // 2. Salvar no FileSystem
      const saveResult = await this._saveUserAction(offlineAction);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 3. Tentar sincronizar online se possível
      const syncResult = await this._tryOnlineSync(offlineAction);
      
      if (syncResult.success) {
        return { success: true };
      } else {
        return { 
          success: true, 
          savedOffline: true, 
          error: `Salvo offline: ${syncResult.error}` 
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao salvar comentário:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * SALVAR DADOS RECORD (ENTRADA COM FOTO) (FileSystem)
   */
  async saveDadosRecord(
    workOrderId: number,
    technicoId: string,
    entradaDadosId: number | null,
    photoUri: string,
    valor?: string,
    etapaId?: number,
    containerId?: string
  ): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> {
    
    await this.initialize();
    const actionId = `dados_record_${workOrderId}_${entradaDadosId ?? 'extra'}_${Date.now()}`;
    
    try {
      console.log(`💾 [UNIFIED-OFFLINE] Salvando dados record para entrada ${entradaDadosId}...`);
      
      // 0. Garantir persistência da foto no FileSystem seguro para uso offline
      try {
        await securePhotoStorage.savePhoto(photoUri, workOrderId, 'DADOS_RECORD');
      } catch (e) {
        console.warn('⚠️ [UNIFIED-OFFLINE] Falha ao salvar foto no FileSystem seguro (continuando):', e);
      }

      // 1. Criar ação offline
      const offlineAction: OfflineUserAction = {
        id: actionId,
        type: 'DADOS_RECORD',
        timestamp: new Date().toISOString(),
        workOrderId,
        technicoId,
        data: {
          entradaDadosId,
          photoUri,
          valor,
          etapaId,
          containerId,
        },
        synced: false,
        attempts: 0
      };

      // 2. Salvar no FileSystem
      const saveResult = await this._saveUserAction(offlineAction);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 3. Tentar sincronizar online se possível
      const syncResult = await this._tryOnlineSync(offlineAction);
      
      if (syncResult.success) {
        return { success: true };
      } else {
        return { 
          success: true, 
          savedOffline: true, 
          error: `Salvo offline: ${syncResult.error}` 
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao salvar entrada de dados:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * SALVAR ENTRADA DE DADOS SIMPLES (FileSystem)
   */
  async saveEntradaDados(
    workOrderId: number,
    technicoId: string,
    entradaDadosId: number,
    valor: string
  ): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> {
    
    await this.initialize();
    const actionId = `entrada_dados_${workOrderId}_${entradaDadosId}_${Date.now()}`;
    
    try {
      console.log(`💾 [UNIFIED-OFFLINE] Salvando entrada de dados ${entradaDadosId}...`);
      
      // 1. Criar ação offline
      const offlineAction: OfflineUserAction = {
        id: actionId,
        type: 'ENTRADA_DADOS',
        timestamp: new Date().toISOString(),
        workOrderId,
        technicoId,
        data: {
          entradaDadosId,
          valor,
        },
        synced: false,
        attempts: 0
      };

      // 2. Salvar no FileSystem
      const saveResult = await this._saveUserAction(offlineAction);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 3. Tentar sincronizar online se possível
      const syncResult = await this._tryOnlineSync(offlineAction);
      
      if (syncResult.success) {
        return { success: true };
      } else {
        return { 
          success: true, 
          savedOffline: true, 
          error: `Salvo offline: ${syncResult.error}` 
        };
      }

    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao salvar entrada de dados:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * SALVAR AUDITORIA FINAL (FileSystem)
   */
  async saveAuditoriaFinal(
    workOrderId: number,
    technicoId: string,
    photoBase64: string,
    trabalhoRealizado: boolean,
    motivo?: string,
    comentario?: string
  ): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> {
    
    await this.initialize();
    
    try {
      // 1. Criar ação offline
      const actionId = `auditoria_${workOrderId}_${Date.now()}`;
      const offlineAction: OfflineUserAction = {
        id: actionId,
        type: 'AUDITORIA_FINAL',
        timestamp: new Date().toISOString(),
        workOrderId,
        technicoId,
        data: {
          photoBase64,
          trabalhoRealizado,
          motivo,
          comentario
        },
        synced: false,
        attempts: 0
      };

      // 2. Salvar no FileSystem
      const saveResult = await this._saveUserAction(offlineAction);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      // 3. Tentar sincronizar online se possível
      const syncResult = await this._tryOnlineSync(offlineAction);
      
      if (syncResult.success) {
        return { success: true };
      } else {
        return { 
          success: true, 
          savedOffline: true, 
          error: `Salvo offline: ${syncResult.error}` 
        };
      }

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * SALVAR DADOS DE ETAPA LOCAL (MÉTODO DE COMPATIBILIDADE)
   */
  async saveServiceStepDataLocal(
    workOrderId: number,
    etapaId: number,
    valor?: string,
    fotoBase64?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    
    await this.initialize();
    
    try {
      console.log(`💾 [UNIFIED-OFFLINE] Salvando dados de etapa local: OS ${workOrderId}, Etapa ${etapaId}`);
      
      if (fotoBase64) {
        // Salvar como dados record (com foto)
        const result = await this.saveDadosRecord(
          workOrderId,
          'fallback_local',
          etapaId,
          fotoBase64,
          valor
        );
        
        if (result.success) {
          return {
            success: true,
            data: {
              id: Date.now(),
              etapa_os_id: etapaId,
              ordem_entrada: 1,
              valor,
              foto_base64: fotoBase64,
              completed: true
            }
          };
        } else {
          return { success: false, error: result.error };
        }
      } else if (valor) {
        // Salvar como entrada de dados simples
        const result = await this.saveEntradaDados(
          workOrderId,
          'fallback_local',
          etapaId,
          valor
        );
        
        if (result.success) {
          return {
            success: true,
            data: {
              id: Date.now(),
              etapa_os_id: etapaId,
              ordem_entrada: 1,
              valor,
              completed: true
            }
          };
        } else {
          return { success: false, error: result.error };
        }
      } else {
        return { success: false, error: 'Nenhum valor ou foto fornecido' };
      }
      
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao salvar dados de etapa local:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * RECUPERAR DADOS OFFLINE DO USUÁRIO
   */
  async getUserOfflineData(workOrderId: number): Promise<{
    data: OfflineUserData;
    success: boolean;
    error?: string;
  }> {
    
    await this.initialize();
    
    try {
      console.log(`🔍 [UNIFIED-OFFLINE] Recuperando dados offline para OS ${workOrderId}...`);
      
      const result = await secureDataStorage.getData('USER_ACTIONS', `user_actions_${workOrderId}`);
      
      if (result.data && Array.isArray(result.data)) {
        const actions = result.data as OfflineUserAction[];
        
        const userData: OfflineUserData = {
          comentarios: actions.filter(a => a.type === 'COMENTARIO_ETAPA'),
          dadosRecords: actions.filter(a => a.type === 'DADOS_RECORD'),
          entradaDados: actions.filter(a => a.type === 'ENTRADA_DADOS'),
          auditorias: actions.filter(a => a.type === 'AUDITORIA_FINAL')
        };
        
        return {
          data: userData,
          success: true
        };
      }
      
      // Nenhum dado encontrado - retornar estrutura vazia
      return {
        data: {
          comentarios: [],
          dadosRecords: [],
          entradaDados: [],
          auditorias: []
        },
        success: true
      };
      
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao recuperar dados offline:', error);
      return {
        data: {
          comentarios: [],
          dadosRecords: [],
          entradaDados: [],
          auditorias: []
        },
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * SINCRONIZAR TODAS AS AÇÕES PENDENTES
   */
  async syncPendingActions(workOrderId?: number): Promise<{
    success: boolean;
    synced: number;
    errors: string[];
  }> {
    
    await this.initialize();
    
    try {
      console.log('🔄 [UNIFIED-OFFLINE] Iniciando sincronização de ações pendentes...');
      
      // Verificar conectividade
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('📱 [UNIFIED-OFFLINE] Sem conexão - pulando sincronização');
        return {
          success: false,
          synced: 0,
          errors: ['Sem conexão para sincronização']
        };
      }

      console.log('🌐 [UNIFIED-OFFLINE] Conexão disponível - buscando ações pendentes...');

      // Buscar todas as ações pendentes ou de uma OS específica
      const allActions = await this._getAllPendingActions(workOrderId);
      
      console.log(`🔍 [UNIFIED-OFFLINE] ${allActions.length} ações pendentes encontradas`);
      
      if (allActions.length === 0) {
        console.log('✅ [UNIFIED-OFFLINE] Nenhuma ação pendente para sincronizar');
        // Mesmo sem ações, ainda tentar sincronizar fotos iniciais pendentes do sistema seguro
        const { synced, errors } = await this._syncPendingInitialPhotos(workOrderId);
        return {
          success: errors.length === 0,
          synced,
          errors
        };
      }

      // Log detalhado das ações encontradas
      allActions.forEach((action, index) => {
        console.log(`📋 [UNIFIED-OFFLINE] Ação ${index + 1}: ${action.type} (OS: ${action.workOrderId})`);
      });
      
      let synced = 0;
      const errors: string[] = [];
      
      for (const action of allActions) {
        try {
          console.log(`🔄 [UNIFIED-OFFLINE] Sincronizando ação: ${action.id} (${action.type})`);
          
          const result = await this._tryOnlineSync(action);
          if (result.success) {
            synced++;
            console.log(`✅ [UNIFIED-OFFLINE] Ação ${action.id} sincronizada com sucesso`);
          } else {
            console.log(`❌ [UNIFIED-OFFLINE] Erro na ação ${action.id}: ${result.error}`);
            errors.push(`${action.id}: ${result.error}`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
          console.log(`💥 [UNIFIED-OFFLINE] Erro crítico na ação ${action.id}: ${errorMsg}`);
          errors.push(`${action.id}: ${errorMsg}`);
        }
      }
      
      // Após sincronizar ações, sincronizar fotos iniciais pendentes do sistema seguro
      try {
        const extra = await this._syncPendingInitialPhotos(workOrderId, allActions.map(a => a.workOrderId));
        synced += extra.synced;
        errors.push(...extra.errors);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      
      console.log(`✅ [UNIFIED-OFFLINE] Sincronização concluída: ${synced}/${allActions.length} ações sincronizadas`);
      
      if (errors.length > 0) {
        console.log(`⚠️ [UNIFIED-OFFLINE] Erros encontrados: ${errors.length}`);
        errors.forEach(error => console.log(`   - ${error}`));
      }
      
      return {
        success: errors.length === 0,
        synced,
        errors
      };
      
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro na sincronização:', error);
      return {
        success: false,
        synced: 0,
        errors: [error instanceof Error ? error.message : 'Erro desconhecido']
      };
    }
  }

  /**
   * CONTAR AÇÕES PENDENTES (SEM SINCRONIZAR)
   */
  async countPendingActions(workOrderId?: number): Promise<{
    count: number;
    byType: { [type: string]: number };
  }> {
    await this.initialize();
    
    try {
      const allActions = await this._getAllPendingActions(workOrderId);
      
      const byType: { [type: string]: number } = {};
      allActions.forEach(action => {
        byType[action.type] = (byType[action.type] || 0) + 1;
      });
      
      return {
        count: allActions.length,
        byType
      };
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao contar ações pendentes:', error);
      return { count: 0, byType: {} };
    }
  }

  // ========== MÉTODOS PRIVADOS ==========

  /**
   * Salvar ação do usuário no FileSystem
   */
  private async _saveUserAction(action: OfflineUserAction): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Buscar ações existentes
      const existingResult = await secureDataStorage.getData('USER_ACTIONS', `user_actions_${action.workOrderId}`);
      const existingActions = (existingResult.data as OfflineUserAction[]) || [];
      
      // Adicionar nova ação
      existingActions.push(action);
      
      // Salvar de volta
      const saveResult = await secureDataStorage.saveData('USER_ACTIONS', existingActions, `user_actions_${action.workOrderId}`);
      
      if (saveResult.success) {
        console.log(`✅ [UNIFIED-OFFLINE] Ação ${action.id} salva no FileSystem`);
        return { success: true };
      } else {
        return { success: false, error: saveResult.error };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      };
    }
  }

  /**
   * Tentar sincronizar ação online
   */
  private async _tryOnlineSync(action: OfflineUserAction): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        return { success: false, error: 'Sem conexão' };
      }

      let result: any;
      
      switch (action.type) {
        case 'COMENTARIO_ETAPA':
          result = await saveComentarioEtapa(
            action.workOrderId,
            action.data.etapaId,
            action.data.comentario
          );
          break;
          
        case 'DADOS_RECORD':
          // Se houver containerId, desativar o registro anterior relacionado a este container
          if (action.data.containerId) {
            try {
              const index = await this._getExtraPhotosIndex(action.workOrderId);
              const current = index.find(i => i.containerId === action.data.containerId);
              if (current?.supabaseId) {
                await supabase
                  .from('dados')
                  .update({ ativo: 0, dt_edicao: new Date().toISOString() })
                  .eq('id', current.supabaseId);
              }
            } catch (e) {
              console.warn('⚠️ [UNIFIED-OFFLINE] Falha ao desativar registro anterior (containerId):', e);
            }
          }

          result = await saveDadosRecord(
            action.workOrderId,
            action.data.entradaDadosId,
            action.data.photoBase64 || action.data.photoUri,
            action.data.etapaId
          );

          // Atualizar índice com o novo supabaseId quando disponível
          if (!result.error && result.data?.id && action.data.containerId) {
            await this._upsertExtraPhotosIndex(action.workOrderId, {
              containerId: action.data.containerId,
              supabaseId: result.data.id,
              etapaId: action.data.etapaId,
              lastUpdated: new Date().toISOString()
            });
          }
          break;
          
        case 'ENTRADA_DADOS':
          // Para entrada de dados simples, salvar diretamente no Supabase
          const { error } = await supabase
            .from('entrada_dados_preenchidas')
            .insert({
              ordem_servico_id: action.workOrderId,
              entrada_dados_id: action.data.entradaDadosId,
              valor: action.data.valor,
              tecnico_id: action.technicoId,
              created_at: new Date().toISOString()
            });
          
          result = { error };
          break;
          
        case 'AUDITORIA_FINAL':
          // Sincronizar auditoria final
          const { saveAuditoriaFinal } = await import('./auditService');
          const { data: auditoriaData, error: auditoriaError } = await saveAuditoriaFinal(
            action.workOrderId,
            action.technicoId,
            action.data.photoBase64,
            action.data.trabalhoRealizado,
            action.data.motivo,
            action.data.comentario
          );
          
          result = { error: auditoriaError };
          break;
          
        default:
          return { success: false, error: 'Tipo de ação desconhecido' };
      }
      
      if (!result.error) {
        // Marcar como sincronizada
        await this._markActionAsSynced(action);
        console.log(`✅ [UNIFIED-OFFLINE] Ação ${action.id} sincronizada com sucesso`);
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      };
    }
  }

  /**
   * Marcar ação como sincronizada
   */
  private async _markActionAsSynced(action: OfflineUserAction): Promise<void> {
    try {
      const result = await secureDataStorage.getData('USER_ACTIONS', `user_actions_${action.workOrderId}`);
      const actions = (result.data as OfflineUserAction[]) || [];
      
      const updatedActions = actions.map(a => 
        a.id === action.id ? { ...a, synced: true } : a
      );
      
      await secureDataStorage.saveData('USER_ACTIONS', updatedActions, `user_actions_${action.workOrderId}`);
      
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao marcar ação como sincronizada:', error);
    }
  }

  /**
   * Buscar todas as ações pendentes
   */
  private async _getAllPendingActions(workOrderId?: number): Promise<OfflineUserAction[]> {
    try {
      if (workOrderId) {
        // Buscar ações de uma OS específica
        const result = await secureDataStorage.getData('USER_ACTIONS', `user_actions_${workOrderId}`);
        const actions = (result.data as OfflineUserAction[]) || [];
        return actions.filter(a => !a.synced);
      } else {
        // Buscar todas as ações pendentes de todas as OSs
        const allPendingActions: OfflineUserAction[] = [];
        
        // Buscar por IDs sequenciais de forma mais eficiente
        const diagnostics = await secureDataStorage.getDiagnostics();
        const userActionsCount = diagnostics.dataTypes.USER_ACTIONS || 0;
        
        console.log(`🔍 [UNIFIED-OFFLINE] ${userActionsCount} arquivos USER_ACTIONS encontrados`);
        
        if (userActionsCount > 0) {
          // SOLUÇÃO CORRETA: Buscar apenas IDs que realmente existem
          try {
            const allMetadata = await secureDataStorage.getAllMetadata();
            const userActionFiles = Object.values(allMetadata)
              .filter(meta => meta.dataType === 'USER_ACTIONS')
              .map(meta => meta.id);
              
            console.log(`🔍 [UNIFIED-OFFLINE] Encontrados ${userActionFiles.length} arquivos USER_ACTIONS`);
            
            for (const fileId of userActionFiles) {
              try {
                const result = await secureDataStorage.getData('USER_ACTIONS', fileId);
                if (result.data && Array.isArray(result.data)) {
                  const actions = result.data as OfflineUserAction[];
                  const pendingActions = actions.filter(a => !a.synced);
                  if (pendingActions.length > 0) {
                    console.log(`📋 [UNIFIED-OFFLINE] ${fileId}: ${pendingActions.length} ações pendentes`);
                  }
                  allPendingActions.push(...pendingActions);
                }
              } catch (error) {
                console.warn(`⚠️ [UNIFIED-OFFLINE] Erro ao carregar ${fileId}:`, error);
                continue;
              }
            }
          } catch (metadataError) {
            // Fallback: buscar range limitado mas informar sobre limitação
            console.warn('⚠️ [UNIFIED-OFFLINE] Fallback: buscando range limitado 1-50');
            for (let osId = 1; osId <= 50; osId++) {
              try {
                const result = await secureDataStorage.getData('USER_ACTIONS', `user_actions_${osId}`);
                if (result.data && Array.isArray(result.data)) {
                  const actions = result.data as OfflineUserAction[];
                  const pendingActions = actions.filter(a => !a.synced);
                  if (pendingActions.length > 0) {
                    console.log(`📋 [UNIFIED-OFFLINE] OS ${osId}: ${pendingActions.length} ações pendentes`);
                  }
                  allPendingActions.push(...pendingActions);
                }
              } catch {
                continue;
              }
            }
          }
        }
        
        console.log(`📊 [UNIFIED-OFFLINE] Total: ${allPendingActions.length} ações pendentes encontradas`);
        return allPendingActions;
      }
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao buscar ações pendentes:', error);
      return [];
    }
  }

  /**
   * Desativar foto extra no Supabase para um container específico
   */
  async deactivateExtraPhoto(workOrderId: number, containerId: string): Promise<{ success: boolean; error?: string }> {
    await this.initialize();
    try {
      const index = await this._getExtraPhotosIndex(workOrderId);
      const current = index.find(i => i.containerId === containerId);
      if (current?.supabaseId) {
        const { error } = await supabase
          .from('dados')
          .update({ ativo: 0, dt_edicao: new Date().toISOString() })
          .eq('id', current.supabaseId);
        if (error) return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
    }
  }

  /**
   * Índice de fotos extras por OS (containerId -> supabaseId)
   */
  private async _getExtraPhotosIndex(workOrderId: number): Promise<Array<{ containerId: string; supabaseId: number; etapaId?: number; lastUpdated: string }>> {
    try {
      const result = await secureDataStorage.getData('USER_ACTIONS', `extra_photos_index_${workOrderId}`);
      return (result.data as any[]) || [];
    } catch {
      return [];
    }
  }

  private async _upsertExtraPhotosIndex(workOrderId: number, item: { containerId: string; supabaseId: number; etapaId?: number; lastUpdated: string }): Promise<void> {
    const list = await this._getExtraPhotosIndex(workOrderId);
    const idx = list.findIndex(i => i.containerId === item.containerId);
    if (idx >= 0) list[idx] = item; else list.push(item);
    await secureDataStorage.saveData('USER_ACTIONS', list as any, `extra_photos_index_${workOrderId}`);
  }

  /**
   * Sincroniza fotos iniciais pendentes (PHOTO_INICIO) do sistema seguro
   */
  private async _syncPendingInitialPhotos(
    workOrderId?: number,
    hintedWorkOrders?: number[]
  ): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;
    try {
      // Obter technicoId a partir do perfil salvo no FileSystem (APP_USER mais recente)
      let technicoId: string | null = null;
      try {
        const all = await secureDataStorage.getAllMetadata();
        const userFiles = Object.values(all)
          .filter(m => m.dataType === 'APP_USER')
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (userFiles.length > 0) {
          const res = await secureDataStorage.getData<any>('APP_USER', userFiles[0].id);
          if (res.data && res.data.length > 0) {
            const u = res.data[0] as any;
            technicoId = (u?.id || u?.uuid || '').toString();
          }
        }
      } catch {}
      if (!technicoId) {
        return { synced: 0, errors };
      }
      
      const candidateOsIds = new Set<number>();
      if (typeof workOrderId === 'number') {
        candidateOsIds.add(workOrderId);
      }
      if (hintedWorkOrders && hintedWorkOrders.length > 0) {
        hintedWorkOrders.forEach(id => candidateOsIds.add(id));
      }
      
      // Se não houver dicas, não varrer tudo (evitar pesado). Apenas retorna.
      if (candidateOsIds.size === 0) {
        return { synced, errors };
      }
      
      for (const osId of candidateOsIds) {
        try {
          const photos = await securePhotoStorage.getPhotosByWorkOrder(osId);
          const pendings = photos.filter(p => p.type === 'PHOTO_INICIO' && !p.synced);
          for (const p of pendings) {
            try {
              const base64 = await securePhotoStorage.getPhotoAsBase64(p.id);
              if (!base64) {
                continue;
              }
              const { savePhotoInicio } = await import('./auditService');
              const { error } = await savePhotoInicio(osId, technicoId, base64);
              if (!error) {
                await securePhotoStorage.markAsSynced(p.id);
                synced += 1;
              } else {
                errors.push(`OS ${osId} foto inicial: ${error}`);
              }
            } catch (e) {
              errors.push(`OS ${osId} erro foto inicial: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        } catch (e) {
          errors.push(`OS ${osId} erro ao listar fotos: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    return { synced, errors };
  }
}

const unifiedOfflineDataService = new UnifiedOfflineDataService();
export default unifiedOfflineDataService; 