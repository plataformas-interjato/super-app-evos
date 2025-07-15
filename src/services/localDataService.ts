import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configurações do armazenamento local
const LOCAL_DATA_DIR = `${FileSystem.documentDirectory}local_data/`;

// Interface para dados locais de etapas
export interface LocalStepData {
  id: string;
  workOrderId: number;
  etapaId: number;
  entradaDadosId?: number;
  valor?: string;
  fotoBase64?: string;
  fotoLocalPath?: string;
  completed: boolean;
  timestamp: string;
  synced: boolean;
  type: 'entrada_dados' | 'dados_record' | 'comentario_etapa';
}

// Interface para dados de entrada no formato esperado
export interface ServiceStepData {
  id: number; // Alterado de string para number para compatibilidade
  etapa_os_id: number;
  ordem_entrada: number;
  titulo?: string;
  valor?: string;
  foto_base64?: string;
  foto_modelo?: string;
  completed: boolean;
  created_at?: string;
  local?: boolean;
}

class LocalDataService {
  private initialized = false;

  /**
   * Inicializa o serviço de dados locais
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Criar diretório de dados locais
      await this.createLocalDataDirectory();
      
      this.initialized = true;
      console.log('✅ Serviço de dados locais inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar serviço de dados locais:', error);
      this.initialized = true; // Continuar mesmo com erro
    }
  }

  /**
   * Cria o diretório de dados locais se não existir
   */
  private async createLocalDataDirectory(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(LOCAL_DATA_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(LOCAL_DATA_DIR, { intermediates: true });
      }
    } catch (error) {
      console.warn('⚠️ Erro ao criar diretório de dados locais:', error);
    }
  }

  /**
   * Salva dados de etapa localmente
   */
  async saveLocalStepData(
    workOrderId: number,
    etapaId: number,
    data: {
      entradaDadosId?: number;
      valor?: string;
      fotoBase64?: string;
      fotoLocalPath?: string;
      type: 'entrada_dados' | 'dados_record' | 'comentario_etapa';
    }
  ): Promise<{ success: boolean; id: string; error?: string }> {
    await this.initialize();

    const id = `local_step_${workOrderId}_${etapaId}_${Date.now()}`;
    
    try {
      const localData: LocalStepData = {
        id,
        workOrderId,
        etapaId,
        entradaDadosId: data.entradaDadosId,
        valor: data.valor,
        fotoBase64: data.fotoBase64,
        fotoLocalPath: data.fotoLocalPath,
        completed: true,
        timestamp: new Date().toISOString(),
        synced: false,
        type: data.type
      };

      // Salvar no AsyncStorage
      await AsyncStorage.setItem(`local_step_data_${id}`, JSON.stringify(localData));
      
      // Também salvar em arquivo para backup
      try {
        const filePath = `${LOCAL_DATA_DIR}${id}.json`;
        await FileSystem.writeAsStringAsync(filePath, JSON.stringify(localData));
      } catch (fileError) {
        console.warn('⚠️ Erro ao salvar backup em arquivo:', fileError);
        // Continuar mesmo com erro no backup
      }
      
      console.log(`💾 Dados de etapa salvos localmente: ${id}`);
      return { success: true, id };
    } catch (error) {
      console.error(`❌ Erro ao salvar dados de etapa localmente:`, error);
      return { success: false, id, error: error?.toString() };
    }
  }

  /**
   * Recupera dados de etapa locais
   */
  async getLocalStepData(workOrderId: number, etapaId?: number): Promise<LocalStepData[]> {
    await this.initialize();

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const stepDataKeys = allKeys.filter(key => key.startsWith('local_step_data_'));
      
      const stepDataList: LocalStepData[] = [];
      
      for (const key of stepDataKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const parsed: LocalStepData = JSON.parse(data);
            
            // Filtrar por OS e opcionalmente por etapa
            if (parsed.workOrderId === workOrderId && 
                (etapaId === undefined || parsed.etapaId === etapaId)) {
              stepDataList.push(parsed);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao processar dados de etapa ${key}:`, error);
        }
      }
      
      return stepDataList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`❌ Erro ao recuperar dados de etapa locais:`, error);
      return [];
    }
  }

  /**
   * Salva entrada de dados localmente (compatibilidade com sistema existente)
   */
  async saveServiceStepDataLocal(
    workOrderId: number,
    etapaId: number,
    valor?: string,
    fotoBase64?: string
  ): Promise<{ success: boolean; data: ServiceStepData | null; error?: string }> {
    await this.initialize();

    try {
      const result = await this.saveLocalStepData(workOrderId, etapaId, {
        valor,
        fotoBase64,
        type: 'entrada_dados'
      });

      if (result.success) {
        // Retornar dados no formato esperado pelo sistema
        const data: ServiceStepData = {
          id: parseInt(result.id.split('_').pop() || '0', 10), // Convertendo string para number
          etapa_os_id: etapaId,
          ordem_entrada: 1, // Simplificado
          valor,
          foto_base64: fotoBase64,
          completed: true,
          created_at: new Date().toISOString(),
          local: true // Marcar como dados locais
        };

        console.log(`✅ Entrada de dados salva localmente para etapa ${etapaId}`);
        return { success: true, data };
      } else {
        return { success: false, data: null, error: result.error };
      }
    } catch (error) {
      console.error(`❌ Erro ao salvar entrada de dados:`, error);
      return { success: false, data: null, error: error?.toString() };
    }
  }

  /**
   * Recupera dados de etapas no formato esperado pelo sistema
   */
  async getServiceStepDataLocal(workOrderId: number, etapaIds: number[]): Promise<{ [etapaId: number]: ServiceStepData[] }> {
    await this.initialize();

    try {
      const localData = await this.getLocalStepData(workOrderId);
      const dataByStep: { [etapaId: number]: ServiceStepData[] } = {};

      etapaIds.forEach(etapaId => {
        const stepData = localData.filter(data => 
          data.etapaId === etapaId && data.type === 'entrada_dados'
        );

        if (stepData.length > 0) {
          dataByStep[etapaId] = stepData.map((data, index) => ({
            id: parseInt(data.id.split('_').pop() || '0', 10), // Convertendo string para number
            etapa_os_id: data.etapaId,
            ordem_entrada: index + 1,
            valor: data.valor,
            foto_base64: data.fotoBase64,
            completed: data.completed,
            created_at: data.timestamp,
            local: true
          }));
        }
      });

      console.log(`📱 Dados locais recuperados para ${Object.keys(dataByStep).length} etapas`);
      return dataByStep;
    } catch (error) {
      console.error(`❌ Erro ao recuperar dados de etapas locais:`, error);
      return {};
    }
  }

  /**
   * Recupera dados de etapas combinando cache e dados locais
   */
  async getServiceStepDataCombined(workOrderId: number, etapaIds: number[]): Promise<{ [etapaId: number]: ServiceStepData[] }> {
    await this.initialize();

    try {
      console.log(`🔍 getServiceStepDataCombined: workOrderId=${workOrderId}, etapaIds=[${etapaIds.join(', ')}]`);
      
      // Buscar dados locais primeiro
      const localData = await this.getServiceStepDataLocal(workOrderId, etapaIds);
      console.log(`📱 Dados locais encontrados: ${Object.keys(localData).length} etapas`);
      
      // Buscar dados do cache inicial (entradas_dados)
      const { getCachedTableData } = await import('./initialDataService');
      const cachedEntradas = await getCachedTableData('ENTRADAS_DADOS') as any[];
      console.log(`📋 Cache inicial: ${cachedEntradas.length} entradas encontradas`);
      
      const dataByStep: { [etapaId: number]: ServiceStepData[] } = { ...localData };
      
      // Combinar com dados do cache se não houver dados locais
      etapaIds.forEach(etapaId => {
        if (!dataByStep[etapaId] || dataByStep[etapaId].length === 0) {
          const cacheData = cachedEntradas.filter(entrada => entrada.etapa_os_id === etapaId);
          
          if (cacheData.length > 0) {
            console.log(`📝 Adicionando ${cacheData.length} entradas do cache para etapa ${etapaId}`);
            dataByStep[etapaId] = cacheData.map(entrada => ({
              id: entrada.id, // Já é number do cache
              etapa_os_id: entrada.etapa_os_id,
              ordem_entrada: entrada.ordem_entrada || 1,
              titulo: entrada.titulo,
              valor: entrada.valor,
              foto_base64: entrada.foto_base64,
              foto_modelo: entrada.foto_modelo,
              completed: entrada.completed || false,
              created_at: entrada.created_at,
              local: false
            }));
          } else {
            console.log(`📭 Nenhuma entrada encontrada para etapa ${etapaId} no cache`);
          }
        } else {
          console.log(`📱 Usando ${dataByStep[etapaId].length} dados locais para etapa ${etapaId}`);
        }
      });

      const totalEntries = Object.values(dataByStep).reduce((sum, entries) => sum + entries.length, 0);
      console.log(`📊 Dados combinados: ${Object.keys(dataByStep).length} etapas com ${totalEntries} entradas totais`);
      
      return dataByStep;
    } catch (error) {
      console.error(`❌ Erro ao recuperar dados combinados:`, error);
      return {};
    }
  }

  /**
   * Marca dados como sincronizados
   */
  async markDataAsSynced(dataId: string): Promise<void> {
    await this.initialize();

    try {
      const key = `local_step_data_${dataId}`;
      const data = await AsyncStorage.getItem(key);
      
      if (data) {
        const parsed: LocalStepData = JSON.parse(data);
        parsed.synced = true;
        
        await AsyncStorage.setItem(key, JSON.stringify(parsed));
        console.log(`✅ Dados marcados como sincronizados: ${dataId}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao marcar dados como sincronizados:`, error);
    }
  }

  /**
   * Remove dados locais de uma OS específica
   */
  async clearLocalDataForWorkOrder(workOrderId: number): Promise<void> {
    await this.initialize();

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(key => 
        key.startsWith('local_step_data_') && key.includes(`_${workOrderId}_`)
      );

      if (keysToRemove.length > 0) {
        // Remover do AsyncStorage
        await AsyncStorage.multiRemove(keysToRemove);
        
        // Remover backups de arquivo
        for (const key of keysToRemove) {
          try {
            const data = await AsyncStorage.getItem(key);
            if (data) {
              const parsed: LocalStepData = JSON.parse(data);
              const filePath = `${LOCAL_DATA_DIR}${parsed.id}.json`;
              const fileInfo = await FileSystem.getInfoAsync(filePath);
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(filePath);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Erro ao remover backup de arquivo:`, error);
          }
        }
        
        console.log(`🧹 Removidos ${keysToRemove.length} dados locais da OS ${workOrderId}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao limpar dados locais da OS ${workOrderId}:`, error);
    }
  }

  /**
   * Obtém estatísticas de dados locais
   */
  async getLocalDataStats(): Promise<{
    totalLocalData: number;
    dataByType: { [type: string]: number };
    unsyncedCount: number;
  }> {
    await this.initialize();

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const localDataKeys = allKeys.filter(key => key.startsWith('local_step_data_'));
      
      const dataByType: { [type: string]: number } = {};
      let unsyncedCount = 0;
      
      for (const key of localDataKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const parsed: LocalStepData = JSON.parse(data);
            
            dataByType[parsed.type] = (dataByType[parsed.type] || 0) + 1;
            
            if (!parsed.synced) {
              unsyncedCount++;
            }
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao processar estatísticas de ${key}:`, error);
        }
      }
      
      return {
        totalLocalData: localDataKeys.length,
        dataByType,
        unsyncedCount
      };
    } catch (error) {
      console.error(`❌ Erro ao obter estatísticas de dados locais:`, error);
      return {
        totalLocalData: 0,
        dataByType: {},
        unsyncedCount: 0
      };
    }
  }
}

// Instância singleton do serviço
const localDataService = new LocalDataService();

export default localDataService; 