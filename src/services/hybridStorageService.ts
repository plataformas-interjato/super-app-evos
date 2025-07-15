import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configurações do armazenamento híbrido
const PHOTOS_DIR = `${FileSystem.documentDirectory}photos/`;

// Interface para dados estruturados
export interface HybridStorageItem {
  key: string;
  data: any;
  type: 'cache' | 'offline_action' | 'work_order' | 'initial_data';
  timestamp: string;
  size?: number;
}

// Interface para fotos
export interface PhotoStorageItem {
  id: string;
  fileName: string;
  filePath: string;
  originalUri: string;
  base64?: string;
  size: number;
  timestamp: string;
  workOrderId?: number;
  actionType?: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'DADOS_RECORD';
}

class HybridStorageService {
  private initialized = false;

  /**
   * Inicializa o serviço de armazenamento híbrido
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Criar diretório de fotos
      await this.createPhotosDirectory();
      
      this.initialized = true;
      console.log('✅ Serviço de armazenamento híbrido inicializado (AsyncStorage)');
    } catch (error) {
      console.error('❌ Erro ao inicializar armazenamento híbrido:', error);
      this.initialized = true; // Continuar mesmo com erro
    }
  }

  /**
   * Cria o diretório de fotos se não existir
   */
  private async createPhotosDirectory(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(PHOTOS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
      }
    } catch (error) {
      console.warn('⚠️ Erro ao criar diretório de fotos:', error);
    }
  }

  /**
   * Salva dados no AsyncStorage
   */
  async setItem(key: string, data: any, type: 'cache' | 'offline_action' | 'work_order' | 'initial_data' = 'cache'): Promise<void> {
    await this.initialize();

    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
      console.log(`💾 Dados salvos no AsyncStorage: ${key}`);
    } catch (error) {
      console.error(`❌ Erro ao salvar item ${key}:`, error);
      throw error;
    }
  }

  /**
   * Recupera dados do AsyncStorage
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    await this.initialize();

    try {
      const data = await AsyncStorage.getItem(key);
      if (data) {
        try {
          return JSON.parse(data) as T;
        } catch (parseError) {
          console.error(`❌ Erro ao fazer parse de dados para chave ${key}:`, parseError);
          // Se falhar no parse, remover dados corrompidos
          await AsyncStorage.removeItem(key);
          return null;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Erro ao recuperar item ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove dados do AsyncStorage
   */
  async removeItem(key: string): Promise<void> {
    await this.initialize();

    try {
      await AsyncStorage.removeItem(key);
      console.log(`🗑️ Dados removidos do AsyncStorage: ${key}`);
    } catch (error) {
      console.error(`❌ Erro ao remover item ${key}:`, error);
      throw error;
    }
  }

  /**
   * Salva foto no sistema de arquivos
   */
  async savePhoto(
    photoUri: string,
    actionType: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'DADOS_RECORD',
    workOrderId?: number,
    customId?: string
  ): Promise<{ id: string; filePath: string; success: boolean; error?: string }> {
    await this.initialize();

    const id = customId || `${actionType}_${workOrderId || 'no_wo'}_${Date.now()}`;
    const fileName = `${id}.jpg`;
    const filePath = `${PHOTOS_DIR}${fileName}`;

    try {
      // Verificar se o arquivo original existe
      const originalInfo = await FileSystem.getInfoAsync(photoUri);
      if (!originalInfo.exists) {
        return { id, filePath, success: false, error: 'Arquivo original não encontrado' };
      }

      // Copiar foto para o diretório de fotos
      await FileSystem.copyAsync({
        from: photoUri,
        to: filePath
      });

      // Obter tamanho do arquivo
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      const size = fileInfo.exists ? ((fileInfo as any).size || 0) : 0;

      // Salvar metadados no AsyncStorage
      try {
        const photoMetadata = {
          id, fileName, filePath, originalUri: photoUri, size,
          timestamp: new Date().toISOString(), workOrderId, actionType
        };
        await AsyncStorage.setItem(`photo_${id}`, JSON.stringify(photoMetadata));
      } catch (metadataError) {
        console.warn('⚠️ Erro ao salvar metadados da foto:', metadataError);
        // Continuar mesmo com erro nos metadados
      }

      console.log(`📸 Foto salva: ${fileName} (${size} bytes)`);
      return { id, filePath, success: true };
    } catch (error) {
      console.error(`❌ Erro ao salvar foto ${id}:`, error);
      
      // Tentar limpar arquivo em caso de erro
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(filePath);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Erro ao limpar arquivo após falha:', cleanupError);
      }
      
      return { id, filePath, success: false, error: error?.toString() || 'Erro desconhecido' };
    }
  }

  /**
   * Recupera foto como base64
   */
  async getPhotoAsBase64(photoId: string): Promise<{ base64: string | null; error?: string }> {
    await this.initialize();

    try {
      // Buscar no AsyncStorage
      const metadata = await AsyncStorage.getItem(`photo_${photoId}`);
      if (!metadata) {
        return { base64: null, error: 'Foto não encontrada' };
      }

      const parsed = JSON.parse(metadata);
      const filePath = parsed.filePath;

      if (!filePath) {
        return { base64: null, error: 'Caminho da foto não encontrado' };
      }

      // Verificar se o arquivo existe
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        return { base64: null, error: 'Arquivo de foto não encontrado' };
      }

      // Converter para base64
      const base64 = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return { base64: `data:image/jpeg;base64,${base64}` };
    } catch (error) {
      console.error(`❌ Erro ao recuperar foto ${photoId}:`, error);
      return { base64: null, error: error?.toString() || 'Erro desconhecido' };
    }
  }

  /**
   * Remove foto do sistema de arquivos
   */
  async removePhoto(photoId: string): Promise<void> {
    await this.initialize();

    try {
      // Buscar no AsyncStorage
      const metadata = await AsyncStorage.getItem(`photo_${photoId}`);
      let filePath: string | null = null;
      
      if (metadata) {
        const parsed = JSON.parse(metadata);
        filePath = parsed.filePath;
      }
      
      // Remover metadados do AsyncStorage
      await AsyncStorage.removeItem(`photo_${photoId}`);

      // Remover arquivo se existir
      if (filePath) {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(filePath);
        }
      }

      console.log(`🗑️ Foto removida: ${photoId}`);
    } catch (error) {
      console.error(`❌ Erro ao remover foto ${photoId}:`, error);
      throw error;
    }
  }

  /**
   * Lista todas as fotos de uma OS específica
   */
  async getPhotosByWorkOrder(workOrderId: number): Promise<PhotoStorageItem[]> {
    await this.initialize();

    try {
      // Buscar no AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      const photoKeys = allKeys.filter(key => key.startsWith('photo_'));
      const photos: PhotoStorageItem[] = [];
      
      for (const key of photoKeys) {
        try {
          const metadata = await AsyncStorage.getItem(key);
          if (metadata) {
            const parsed = JSON.parse(metadata);
            if (parsed.workOrderId === workOrderId) {
              photos.push(parsed);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao processar foto ${key}:`, error);
        }
      }
      
      return photos.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`❌ Erro ao buscar fotos da OS ${workOrderId}:`, error);
      return [];
    }
  }

  /**
   * Limpa dados antigos para liberar espaço
   */
  async cleanup(daysToKeep: number = 30): Promise<void> {
    await this.initialize();

    try {
      const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)).toISOString();
      
      // Limpeza no AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      let removedCount = 0;
      
      for (const key of allKeys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.timestamp && parsed.timestamp < cutoffDate) {
              // Se for uma foto, remover arquivo também
              if (key.startsWith('photo_') && parsed.filePath) {
                try {
                  const fileInfo = await FileSystem.getInfoAsync(parsed.filePath);
                  if (fileInfo.exists) {
                    await FileSystem.deleteAsync(parsed.filePath);
                  }
                } catch (fileError) {
                  console.warn(`⚠️ Erro ao deletar arquivo: ${parsed.filePath}`);
                }
              }
              
              await AsyncStorage.removeItem(key);
              removedCount++;
            }
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao processar chave ${key} na limpeza:`, error);
        }
      }
      
      console.log(`🧹 Limpeza concluída: ${removedCount} itens antigos removidos`);
    } catch (error) {
      console.error('❌ Erro durante limpeza:', error);
    }
  }

  /**
   * Limpa dados corrompidos do cache
   */
  async clearCorruptedData(): Promise<void> {
    await this.initialize();

    try {
      console.log('🧹 Limpando dados corrompidos do cache...');
      
      // Limpar AsyncStorage
      const keys = ['cache_timestamp', 'work_orders_cache_timestamp', 'cache_cleanup_timestamp'];
      for (const key of keys) {
        try {
          await AsyncStorage.removeItem(key);
        } catch (error) {
          console.warn(`⚠️ Erro ao remover ${key}:`, error);
        }
      }
      
      console.log('✅ Dados corrompidos removidos do AsyncStorage');
    } catch (error) {
      console.error('❌ Erro ao limpar dados corrompidos:', error);
    }
  }

  /**
   * Obtém estatísticas de armazenamento
   */
  async getStorageStats(): Promise<{
    totalItems: number;
    totalPhotos: number;
    totalSize: number;
    storageByType: { [type: string]: number };
  }> {
    await this.initialize();

    try {
      // Estatísticas básicas do AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      const photoKeys = allKeys.filter(key => key.startsWith('photo_'));
      
      return {
        totalItems: allKeys.length - photoKeys.length,
        totalPhotos: photoKeys.length,
        totalSize: 0, // Não é possível calcular facilmente no AsyncStorage
        storageByType: {
          'items': allKeys.length - photoKeys.length,
          'photos': photoKeys.length
        }
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return {
        totalItems: 0,
        totalPhotos: 0,
        totalSize: 0,
        storageByType: {}
      };
    }
  }

  /**
   * Migra dados do AsyncStorage para o armazenamento híbrido (não necessário)
   */
  async migrateFromAsyncStorage(keys: string[], type: 'cache' | 'offline_action' | 'work_order' | 'initial_data'): Promise<number> {
    console.log('📦 Migração não necessária - usando AsyncStorage diretamente');
    return 0;
  }
}

// Instância singleton do serviço
const hybridStorage = new HybridStorageService();

export default hybridStorage; 