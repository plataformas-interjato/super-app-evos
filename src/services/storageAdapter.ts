import AsyncStorage from '@react-native-async-storage/async-storage';
import hybridStorage from './hybridStorageService';
import migrationService from './migrationService';

// Chaves que devem usar o armazenamento híbrido
const HYBRID_STORAGE_KEYS = [
  // Dados iniciais (grandes volumes)
  'initial_cache_usuarios',
  'initial_cache_clientes',
  'initial_cache_tipos_os',
  'initial_cache_etapas_os',
  'initial_cache_entradas_dados',
  'initial_cache_dados',
  'initial_cache_auditorias_tecnico',
  'initial_cache_auditorias',
  'initial_cache_comentarios_etapa',
  'last_initial_sync_timestamp',
  
  // Cache de ordens de serviço
  'cached_work_orders',
  'work_orders_cache_timestamp',
  'cache_cleanup_timestamp',
  
  // Ações offline
  'offline_actions',
  
  // Cache de serviços
  'cached_service_steps',
  'cached_service_entries',
  'cache_timestamp',
  'preload_status',
];

// Prefixos que devem usar o armazenamento híbrido
const HYBRID_STORAGE_PREFIXES = [
  'local_work_order_status_',
  'cached_user_work_orders_',
  'completed_steps_',
  'collected_photos_',
  'progress_',
  'os_cache_',
  'temp_data_',
  'user_initial_sync_completed_',
];

/**
 * Adaptador que intercepta chamadas do AsyncStorage
 */
class StorageAdapter {
  private migrationInitialized = false;

  /**
   * Inicializa o adaptador e executa migração automática
   */
  async initialize(): Promise<void> {
    if (this.migrationInitialized) return;

    try {
      // Executar migração automática em background
      await migrationService.performAutoMigration();
      this.migrationInitialized = true;
      
      console.log('📦 Adaptador de armazenamento inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar adaptador de armazenamento:', error);
    }
  }

  /**
   * Verifica se uma chave deve usar o armazenamento híbrido
   */
  private shouldUseHybridStorage(key: string): boolean {
    // Verificar chaves exatas
    if (HYBRID_STORAGE_KEYS.includes(key)) {
      return true;
    }

    // Verificar prefixos
    return HYBRID_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  /**
   * Determina o tipo de dados baseado na chave
   */
  private getDataType(key: string): 'cache' | 'offline_action' | 'work_order' | 'initial_data' {
    if (key.startsWith('initial_cache_') || key.startsWith('user_initial_sync_completed_') || key === 'last_initial_sync_timestamp') {
      return 'initial_data';
    }
    
    if (key.startsWith('cached_work_orders') || key.startsWith('cached_user_work_orders_') || key.includes('work_orders_cache')) {
      return 'work_order';
    }
    
    if (key === 'offline_actions' || key.startsWith('local_work_order_status_')) {
      return 'offline_action';
    }
    
    return 'cache';
  }

  /**
   * Intercepta getItem do AsyncStorage
   */
  async getItem(key: string): Promise<string | null> {
    await this.initialize();

    try {
      // Verificar se deve usar armazenamento híbrido
      if (this.shouldUseHybridStorage(key)) {
        const migrationCompleted = await migrationService.isMigrationCompleted();
        
        if (migrationCompleted) {
          // Usar armazenamento híbrido
          const data = await hybridStorage.getItem(key);
          if (data === null) return null;
          
          // Se o dado é uma string simples, retornar diretamente
          // Se é um objeto, fazer JSON.stringify
          if (typeof data === 'string') {
            return data;
          } else {
            return JSON.stringify(data);
          }
        }
      }

      // Usar AsyncStorage padrão
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error(`❌ Erro ao obter item ${key}:`, error);
      // Fallback para AsyncStorage em caso de erro
      return await AsyncStorage.getItem(key);
    }
  }

  /**
   * Intercepta setItem do AsyncStorage
   */
  async setItem(key: string, value: string): Promise<void> {
    await this.initialize();

    try {
      // Verificar se deve usar armazenamento híbrido
      if (this.shouldUseHybridStorage(key)) {
        const migrationCompleted = await migrationService.isMigrationCompleted();
        
        if (migrationCompleted) {
          // Usar armazenamento híbrido
          const dataType = this.getDataType(key);
          
          // Tentar fazer parse do JSON, se falhar, assumir que é uma string simples
          let data;
          try {
            data = JSON.parse(value);
          } catch (parseError) {
            // Se não conseguir fazer parse, assumir que é uma string simples
            data = value;
          }
          
          await hybridStorage.setItem(key, data, dataType);
          return;
        }
      }

      // Usar AsyncStorage padrão
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error(`❌ Erro ao salvar item ${key}:`, error);
      // Fallback para AsyncStorage em caso de erro
      await AsyncStorage.setItem(key, value);
    }
  }

  /**
   * Intercepta removeItem do AsyncStorage
   */
  async removeItem(key: string): Promise<void> {
    await this.initialize();

    try {
      // Verificar se deve usar armazenamento híbrido
      if (this.shouldUseHybridStorage(key)) {
        const migrationCompleted = await migrationService.isMigrationCompleted();
        
        if (migrationCompleted) {
          // Usar armazenamento híbrido
          await hybridStorage.removeItem(key);
          return;
        }
      }

      // Usar AsyncStorage padrão
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`❌ Erro ao remover item ${key}:`, error);
      // Fallback para AsyncStorage em caso de erro
      await AsyncStorage.removeItem(key);
    }
  }

  /**
   * Intercepta multiGet do AsyncStorage
   */
  async multiGet(keys: string[]): Promise<readonly (readonly [string, string | null])[]> {
    await this.initialize();

    try {
      const results: [string, string | null][] = [];
      
      for (const key of keys) {
        const value = await this.getItem(key);
        results.push([key, value]);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Erro ao obter múltiplos itens:', error);
      // Fallback para AsyncStorage em caso de erro
      return await AsyncStorage.multiGet(keys);
    }
  }

  /**
   * Intercepta multiSet do AsyncStorage
   */
  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    await this.initialize();

    try {
      for (const [key, value] of keyValuePairs) {
        await this.setItem(key, value);
      }
    } catch (error) {
      console.error('❌ Erro ao salvar múltiplos itens:', error);
      // Fallback para AsyncStorage em caso de erro
      await AsyncStorage.multiSet(keyValuePairs);
    }
  }

  /**
   * Intercepta multiRemove do AsyncStorage
   */
  async multiRemove(keys: string[]): Promise<void> {
    await this.initialize();

    try {
      for (const key of keys) {
        await this.removeItem(key);
      }
    } catch (error) {
      console.error('❌ Erro ao remover múltiplos itens:', error);
      // Fallback para AsyncStorage em caso de erro
      await AsyncStorage.multiRemove(keys);
    }
  }

  /**
   * Intercepta getAllKeys do AsyncStorage
   */
  async getAllKeys(): Promise<readonly string[]> {
    await this.initialize();

    try {
      const migrationCompleted = await migrationService.isMigrationCompleted();
      
      if (migrationCompleted) {
        // Combinar chaves do AsyncStorage e armazenamento híbrido
        const asyncStorageKeys = await AsyncStorage.getAllKeys();
        
        // Filtrar chaves que foram migradas
        const filteredKeys = asyncStorageKeys.filter(key => 
          !this.shouldUseHybridStorage(key)
        );
        
        // Adicionar chaves do armazenamento híbrido
        // (Implementação simplificada - em produção, seria necessário consultar o SQLite)
        return filteredKeys;
      }

      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('❌ Erro ao obter todas as chaves:', error);
      // Fallback para AsyncStorage em caso de erro
      return await AsyncStorage.getAllKeys();
    }
  }

  /**
   * Intercepta clear do AsyncStorage
   */
  async clear(): Promise<void> {
    await this.initialize();

    try {
      // Limpar AsyncStorage
      await AsyncStorage.clear();
      
      // Limpar armazenamento híbrido (se migração foi concluída)
      const migrationCompleted = await migrationService.isMigrationCompleted();
      if (migrationCompleted) {
        // Limpeza completa do armazenamento híbrido
        await hybridStorage.cleanup(0); // 0 dias = limpar tudo
      }
    } catch (error) {
      console.error('❌ Erro ao limpar armazenamento:', error);
      // Fallback para AsyncStorage em caso de erro
      await AsyncStorage.clear();
    }
  }

  /**
   * Obtém estatísticas simplificadas do armazenamento
   */
  async getStorageStats(): Promise<{
    asyncStorageSize: number;
    hybridStorageStats: any;
    migrationStatus: any;
  }> {
    await this.initialize();

    try {
      // Simplificar cálculo do AsyncStorage - apenas contar chaves sem calcular tamanho
      const asyncStorageKeys = await AsyncStorage.getAllKeys();
      const asyncStorageSize = asyncStorageKeys.length; // Usar contagem em vez de tamanho real

      // Obter estatísticas do armazenamento híbrido de forma simplificada
      let hybridStorageStats = {
        totalItems: 0,
        totalPhotos: 0,
        totalSize: 0,
        storageByType: {}
      };

      try {
        hybridStorageStats = await hybridStorage.getStorageStats();
      } catch (error) {
        console.warn('⚠️ Erro ao obter estatísticas do armazenamento híbrido:', error);
        // Usar valores padrão em caso de erro
      }
      
      // Obter status da migração de forma simplificada
      let migrationStatus = {
        version: 1,
        completed: false,
        migratedKeys: [],
        lastMigrationDate: new Date().toISOString(),
        photosConverted: 0,
        totalItemsMigrated: 0
      };

      try {
        migrationStatus = await migrationService.getMigrationStatus();
      } catch (error) {
        console.warn('⚠️ Erro ao obter status da migração:', error);
        // Usar valores padrão em caso de erro
      }

      return {
        asyncStorageSize,
        hybridStorageStats,
        migrationStatus
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      // Retornar estatísticas básicas em caso de erro
      return {
        asyncStorageSize: 0,
        hybridStorageStats: {
          totalItems: 0,
          totalPhotos: 0,
          totalSize: 0,
          storageByType: {}
        },
        migrationStatus: {
          version: 1,
          completed: false,
          migratedKeys: [],
          lastMigrationDate: new Date().toISOString(),
          photosConverted: 0,
          totalItemsMigrated: 0
        }
      };
    }
  }

  /**
   * Força migração manual
   */
  async forceMigration(): Promise<{ success: boolean; migratedCount: number; error?: string }> {
    try {
      return await migrationService.performMigration();
    } catch (error) {
      console.error('❌ Erro ao forçar migração:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      return { success: false, migratedCount: 0, error: errorMessage };
    }
  }

  /**
   * Limpa dados migrados do AsyncStorage
   */
  async cleanupMigratedData(): Promise<{ success: boolean; cleanedCount: number }> {
    try {
      return await migrationService.cleanupMigratedData();
    } catch (error) {
      console.error('❌ Erro ao limpar dados migrados:', error);
      return { success: false, cleanedCount: 0 };
    }
  }
}

// Instância singleton do adaptador
const storageAdapter = new StorageAdapter();

export default storageAdapter; 