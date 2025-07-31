import NetInfo from '@react-native-community/netinfo';
import secureDataStorage from './secureDataStorageService';
import { saveComentarioEtapa, saveDadosRecord } from './serviceStepsService';
import { supabase } from './supabase';

/**
 * SERVIÇO UNIFICADO DE DADOS OFFLINE
 * 
 * Salva TODOS os dados (comentários, entradas, fotos) no FileSystem
 * SEM AsyncStorage híbrido - 100% FileSystem
 */

export interface OfflineUserAction {
  id: string;
  type: 'COMENTARIO_ETAPA' | 'DADOS_RECORD' | 'ENTRADA_DADOS';
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
    entradaDadosId: number,
    photoUri: string,
    valor?: string
  ): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> {
    
    await this.initialize();
    const actionId = `dados_record_${workOrderId}_${entradaDadosId}_${Date.now()}`;
    
    try {
      console.log(`💾 [UNIFIED-OFFLINE] Salvando dados record para entrada ${entradaDadosId}...`);
      
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
      console.error('❌ [UNIFIED-OFFLINE] Erro ao salvar dados record:', error);
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
          entradaDados: actions.filter(a => a.type === 'ENTRADA_DADOS')
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
          entradaDados: []
        },
        success: true
      };
      
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao recuperar dados offline:', error);
      return {
        data: {
          comentarios: [],
          dadosRecords: [],
          entradaDados: []
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
        return {
          success: false,
          synced: 0,
          errors: ['Sem conexão para sincronização']
        };
      }

      // Buscar todas as ações pendentes ou de uma OS específica
      const allActions = await this._getAllPendingActions(workOrderId);
      
      if (allActions.length === 0) {
        console.log('✅ [UNIFIED-OFFLINE] Nenhuma ação pendente para sincronizar');
        return {
          success: true,
          synced: 0,
          errors: []
        };
      }

      console.log(`🔄 [UNIFIED-OFFLINE] ${allActions.length} ações pendentes encontradas`);
      
      let synced = 0;
      const errors: string[] = [];
      
      for (const action of allActions) {
        try {
          const result = await this._tryOnlineSync(action);
          if (result.success) {
            synced++;
          } else {
            errors.push(`${action.id}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${action.id}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
      }
      
      console.log(`✅ [UNIFIED-OFFLINE] Sincronização concluída: ${synced}/${allActions.length} ações sincronizadas`);
      
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
          result = await saveDadosRecord(
            action.workOrderId,
            action.data.entradaDadosId,
            action.data.photoUri,
            action.data.valor
          );
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
        // Buscar todas as ações pendentes (implementação futura se necessário)
        console.warn('⚠️ [UNIFIED-OFFLINE] Busca de todas as ações pendentes não implementada');
        return [];
      }
    } catch (error) {
      console.error('❌ [UNIFIED-OFFLINE] Erro ao buscar ações pendentes:', error);
      return [];
    }
  }
}

const unifiedOfflineDataService = new UnifiedOfflineDataService();
export default unifiedOfflineDataService; 