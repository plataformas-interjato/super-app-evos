import AsyncStorage from '@react-native-async-storage/async-storage';
import hybridStorage from './hybridStorageService';

// Configurações da migração
const MIGRATION_STATUS_KEY = 'migration_status';
const MIGRATION_BATCH_SIZE = 10;

// Chaves que devem ser migradas por categoria
const MIGRATION_KEYS = {
  initial_data: [
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
  ],
  work_order: [
    'cached_work_orders',
    'work_orders_cache_timestamp',
    'cache_cleanup_timestamp',
  ],
  offline_action: [
    'offline_actions',
    'local_work_order_status_',
  ],
  cache: [
    'cached_service_steps',
    'cached_service_entries',
    'cache_timestamp',
    'preload_status',
  ]
};

// Status da migração
interface MigrationStatus {
  version: number;
  completed: boolean;
  migratedKeys: string[];
  lastMigrationDate: string;
  photosConverted: number;
  totalItemsMigrated: number;
}

class MigrationService {
  private migrationInProgress = false;

  /**
   * Verifica se a migração já foi concluída
   */
  async isMigrationCompleted(): Promise<boolean> {
    try {
      const status = await this.getMigrationStatus();
      return status.completed;
    } catch (error) {
      console.error('❌ Erro ao verificar status da migração:', error);
      return false;
    }
  }

  /**
   * Obtém o status atual da migração
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    try {
      const statusData = await AsyncStorage.getItem(MIGRATION_STATUS_KEY);
      
      if (!statusData) {
        return {
          version: 1,
          completed: false,
          migratedKeys: [],
          lastMigrationDate: new Date().toISOString(),
          photosConverted: 0,
          totalItemsMigrated: 0
        };
      }

      return JSON.parse(statusData);
    } catch (error) {
      console.error('❌ Erro ao obter status da migração:', error);
      return {
        version: 1,
        completed: false,
        migratedKeys: [],
        lastMigrationDate: new Date().toISOString(),
        photosConverted: 0,
        totalItemsMigrated: 0
      };
    }
  }

  /**
   * Salva o status da migração
   */
  private async saveMigrationStatus(status: MigrationStatus): Promise<void> {
    try {
      await AsyncStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('❌ Erro ao salvar status da migração:', error);
    }
  }

  /**
   * Executa a migração completa
   */
  async performMigration(): Promise<{ success: boolean; migratedCount: number; error?: string }> {
    if (this.migrationInProgress) {
      return { success: false, migratedCount: 0, error: 'Migração já em andamento' };
    }

    this.migrationInProgress = true;
    let totalMigrated = 0;

    try {
      console.log('🔄 Iniciando migração para armazenamento híbrido...');

      const status = await this.getMigrationStatus();
      
      // Migrar dados estruturados por categoria
      for (const [category, keys] of Object.entries(MIGRATION_KEYS)) {
        console.log(`📦 Migrando categoria: ${category}`);
        
        const categoryResult = await this.migrateCategoryData(
          keys, 
          category as 'initial_data' | 'work_order' | 'offline_action' | 'cache',
          status.migratedKeys
        );
        
        totalMigrated += categoryResult.migratedCount;
        status.migratedKeys.push(...categoryResult.migratedKeys);
      }

      // Migrar fotos em base64 para arquivos
      const photoResult = await this.migratePhotosToFiles();
      status.photosConverted += photoResult.convertedCount;

      // Atualizar status
      status.completed = true;
      status.totalItemsMigrated = totalMigrated;
      status.lastMigrationDate = new Date().toISOString();
      await this.saveMigrationStatus(status);

      console.log('✅ Migração concluída com sucesso!');
      console.log(`📊 Total migrado: ${totalMigrated} itens estruturados, ${photoResult.convertedCount} fotos`);

      return { success: true, migratedCount: totalMigrated };
    } catch (error) {
      console.error('❌ Erro na migração:', error);
      return { success: false, migratedCount: totalMigrated, error: error.message };
    } finally {
      this.migrationInProgress = false;
    }
  }

  /**
   * Migra dados de uma categoria específica
   */
  private async migrateCategoryData(
    keys: string[], 
    category: 'initial_data' | 'work_order' | 'offline_action' | 'cache',
    alreadyMigrated: string[]
  ): Promise<{ migratedCount: number; migratedKeys: string[] }> {
    let migratedCount = 0;
    const migratedKeys: string[] = [];

    try {
      // Obter todas as chaves do AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Filtrar chaves que correspondem aos padrões
      const keysToMigrate = allKeys.filter(key => {
        // Verificar se já foi migrada
        if (alreadyMigrated.includes(key)) return false;
        
        // Verificar se corresponde a algum padrão
        return keys.some(pattern => 
          key === pattern || 
          key.startsWith(pattern) || 
          (pattern.endsWith('_') && key.startsWith(pattern))
        );
      });

      console.log(`📋 Encontradas ${keysToMigrate.length} chaves para migrar em ${category}`);

      // Migrar em lotes
      for (let i = 0; i < keysToMigrate.length; i += MIGRATION_BATCH_SIZE) {
        const batch = keysToMigrate.slice(i, i + MIGRATION_BATCH_SIZE);
        
        for (const key of batch) {
          try {
            const data = await AsyncStorage.getItem(key);
            if (data) {
              await hybridStorage.setItem(key, JSON.parse(data), category);
              migratedCount++;
              migratedKeys.push(key);
              console.log(`✅ Migrado: ${key}`);
            }
          } catch (error) {
            console.warn(`⚠️ Erro ao migrar ${key}:`, error);
          }
        }
      }

      return { migratedCount, migratedKeys };
    } catch (error) {
      console.error(`❌ Erro ao migrar categoria ${category}:`, error);
      return { migratedCount, migratedKeys };
    }
  }

  /**
   * Migra fotos em base64 para arquivos
   */
  private async migratePhotosToFiles(): Promise<{ convertedCount: number; errors: string[] }> {
    let convertedCount = 0;
    const errors: string[] = [];

    try {
      console.log('📸 Iniciando migração de fotos base64 para arquivos...');

      // Buscar ações offline que contenham fotos
      const offlineActionsData = await AsyncStorage.getItem('offline_actions');
      if (offlineActionsData) {
        const offlineActions = JSON.parse(offlineActionsData);
        
        for (const [actionId, action] of Object.entries(offlineActions)) {
          if (this.isPhotoAction(action)) {
            try {
              const convertResult = await this.convertPhotoActionToFile(actionId, action);
              if (convertResult.success) {
                convertedCount++;
                console.log(`📸 Foto convertida: ${actionId}`);
              } else {
                errors.push(`${actionId}: ${convertResult.error}`);
              }
            } catch (error) {
              errors.push(`${actionId}: ${error.message}`);
            }
          }
        }
      }

      // Buscar dados iniciais que contenham fotos
      const initialCacheKeys = ['initial_cache_auditorias_tecnico', 'initial_cache_dados'];
      
      for (const key of initialCacheKeys) {
        try {
          const cacheData = await AsyncStorage.getItem(key);
          if (cacheData) {
            const data = JSON.parse(cacheData);
            const photoResult = await this.extractAndConvertPhotosFromCache(key, data);
            convertedCount += photoResult.convertedCount;
            errors.push(...photoResult.errors);
          }
        } catch (error) {
          errors.push(`${key}: ${error.message}`);
        }
      }

      console.log(`📸 Migração de fotos concluída: ${convertedCount} fotos convertidas`);
      
      return { convertedCount, errors };
    } catch (error) {
      console.error('❌ Erro na migração de fotos:', error);
      return { convertedCount, errors: [error.message] };
    }
  }

  /**
   * Verifica se uma ação é relacionada a fotos
   */
  private isPhotoAction(action: any): boolean {
    return action.type && (
      action.type === 'PHOTO_INICIO' ||
      action.type === 'PHOTO_FINAL' ||
      action.type === 'DADOS_RECORD'
    ) && action.data && action.data.photoUri;
  }

  /**
   * Converte uma ação de foto para arquivo
   */
  private async convertPhotoActionToFile(actionId: string, action: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { photoUri } = action.data;
      
      // Verificar se é uma foto em base64 ou um URI local
      if (photoUri.startsWith('data:image/')) {
        // Converter base64 para arquivo temporário primeiro
        const tempUri = await this.base64ToTempFile(photoUri);
        if (!tempUri) {
          return { success: false, error: 'Falha ao converter base64 para arquivo temporário' };
        }
        
        // Salvar no armazenamento híbrido
        const result = await hybridStorage.savePhoto(
          tempUri,
          action.type,
          action.workOrderId,
          actionId
        );
        
        return { success: result.success, error: result.error };
      } else {
        // Já é um URI local, apenas salvar
        const result = await hybridStorage.savePhoto(
          photoUri,
          action.type,
          action.workOrderId,
          actionId
        );
        
        return { success: result.success, error: result.error };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Converte base64 para arquivo temporário
   */
  private async base64ToTempFile(base64Data: string): Promise<string | null> {
    try {
      const FileSystem = await import('expo-file-system');
      
      // Extrair dados base64
      const base64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const tempUri = `${FileSystem.FileSystem.cacheDirectory}temp_photo_${Date.now()}.jpg`;
      
      // Salvar como arquivo temporário
      await FileSystem.FileSystem.writeAsStringAsync(tempUri, base64, {
        encoding: FileSystem.FileSystem.EncodingType.Base64,
      });
      
      return tempUri;
    } catch (error) {
      console.error('❌ Erro ao converter base64 para arquivo temporário:', error);
      return null;
    }
  }

  /**
   * Extrai e converte fotos do cache inicial
   */
  private async extractAndConvertPhotosFromCache(cacheKey: string, data: any[]): Promise<{ convertedCount: number; errors: string[] }> {
    let convertedCount = 0;
    const errors: string[] = [];

    try {
      for (const item of data) {
        // Verificar se o item possui fotos
        const photoFields = ['foto_inicial', 'foto_final', 'valor', 'foto_base64'];
        
        for (const field of photoFields) {
          if (item[field] && typeof item[field] === 'string' && item[field].startsWith('data:image/')) {
            try {
              const photoId = `${cacheKey}_${item.id}_${field}_${Date.now()}`;
              const tempUri = await this.base64ToTempFile(item[field]);
              
              if (tempUri) {
                const result = await hybridStorage.savePhoto(
                  tempUri,
                  'DADOS_RECORD',
                  item.ordem_servico_id,
                  photoId
                );
                
                if (result.success) {
                  convertedCount++;
                  console.log(`📸 Foto do cache convertida: ${photoId}`);
                } else {
                  errors.push(`${photoId}: ${result.error}`);
                }
              }
            } catch (error) {
              errors.push(`${cacheKey}_${item.id}_${field}: ${error.message}`);
            }
          }
        }
      }
      
      return { convertedCount, errors };
    } catch (error) {
      console.error('❌ Erro ao extrair fotos do cache:', error);
      return { convertedCount, errors: [error.message] };
    }
  }

  /**
   * Limpa dados migrados do AsyncStorage (opcional)
   */
  async cleanupMigratedData(): Promise<{ success: boolean; cleanedCount: number }> {
    try {
      const status = await this.getMigrationStatus();
      
      if (!status.completed) {
        return { success: false, cleanedCount: 0 };
      }

      // Remover apenas dados que foram migrados com sucesso
      const keysToRemove = status.migratedKeys.filter(key => key !== MIGRATION_STATUS_KEY);
      
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log(`🧹 Limpeza concluída: ${keysToRemove.length} chaves removidas do AsyncStorage`);
      }

      return { success: true, cleanedCount: keysToRemove.length };
    } catch (error) {
      console.error('❌ Erro na limpeza:', error);
      return { success: false, cleanedCount: 0 };
    }
  }

  /**
   * Executa migração automática no background
   */
  async performAutoMigration(): Promise<void> {
    try {
      const isCompleted = await this.isMigrationCompleted();
      
      if (!isCompleted) {
        console.log('🔄 Executando migração automática...');
        
        // Executar migração em background
        this.performMigration().then(result => {
          if (result.success) {
            console.log('✅ Migração automática concluída com sucesso');
          } else {
            console.error('❌ Falha na migração automática:', result.error);
          }
        }).catch(error => {
          console.error('❌ Erro na migração automática:', error);
        });
      }
    } catch (error) {
      console.error('❌ Erro na migração automática:', error);
    }
  }
}

// Instância singleton do serviço
const migrationService = new MigrationService();

export default migrationService; 