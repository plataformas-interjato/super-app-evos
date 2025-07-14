import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configurações do armazenamento híbrido
const DB_NAME = 'app_offline.db';
const DB_VERSION = 1;
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
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized = false;

  /**
   * Inicializa o serviço de armazenamento híbrido
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 1. Inicializar SQLite
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      
      // 2. Criar tabelas se não existirem
      await this.createTables();
      
      // 3. Criar diretório de fotos se não existir
      await this.createPhotosDirectory();
      
      this.initialized = true;
      console.log('✅ Serviço de armazenamento híbrido inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar armazenamento híbrido:', error);
      throw error;
    }
  }

  /**
   * Cria as tabelas necessárias no SQLite
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const tables = [
      // Tabela para dados estruturados (substitui AsyncStorage para dados grandes)
      `CREATE TABLE IF NOT EXISTS hybrid_storage (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        size INTEGER DEFAULT 0
      )`,
      
      // Tabela para metadados de fotos
      `CREATE TABLE IF NOT EXISTS photo_storage (
        id TEXT PRIMARY KEY,
        fileName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        originalUri TEXT,
        size INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        workOrderId INTEGER,
        actionType TEXT
      )`,
      
      // Índices para performance
      `CREATE INDEX IF NOT EXISTS idx_storage_type ON hybrid_storage(type)`,
      `CREATE INDEX IF NOT EXISTS idx_storage_timestamp ON hybrid_storage(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_photo_workorder ON photo_storage(workOrderId)`,
      `CREATE INDEX IF NOT EXISTS idx_photo_action ON photo_storage(actionType)`
    ];

    for (const table of tables) {
      await this.db.execAsync(table);
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
        console.log('📁 Diretório de fotos criado:', PHOTOS_DIR);
      }
    } catch (error) {
      console.error('❌ Erro ao criar diretório de fotos:', error);
      throw error;
    }
  }

  /**
   * Salva dados estruturados no SQLite
   */
  async setItem(key: string, data: any, type: 'cache' | 'offline_action' | 'work_order' | 'initial_data' = 'cache'): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      const serializedData = JSON.stringify(data);
      const size = new Blob([serializedData]).size;
      
      await this.db.runAsync(
        'INSERT OR REPLACE INTO hybrid_storage (key, data, type, timestamp, size) VALUES (?, ?, ?, ?, ?)',
        [key, serializedData, type, new Date().toISOString(), size]
      );
      
      console.log(`💾 Dados salvos no SQLite: ${key} (${size} bytes)`);
    } catch (error) {
      console.error('❌ Erro ao salvar dados no SQLite:', error);
      throw error;
    }
  }

  /**
   * Recupera dados estruturados do SQLite
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync<{ data: string }>(
        'SELECT data FROM hybrid_storage WHERE key = ?',
        [key]
      );
      
      if (!result) return null;
      
      return JSON.parse(result.data) as T;
    } catch (error) {
      console.error('❌ Erro ao recuperar dados do SQLite:', error);
      return null;
    }
  }

  /**
   * Remove dados estruturados do SQLite
   */
  async removeItem(key: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync('DELETE FROM hybrid_storage WHERE key = ?', [key]);
      console.log(`🗑️ Dados removidos do SQLite: ${key}`);
    } catch (error) {
      console.error('❌ Erro ao remover dados do SQLite:', error);
      throw error;
    }
  }

  /**
   * Salva foto no sistema de arquivos e metadados no SQLite
   */
  async savePhoto(
    photoUri: string,
    actionType: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'DADOS_RECORD',
    workOrderId?: number,
    customId?: string
  ): Promise<{ id: string; filePath: string; success: boolean; error?: string }> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Gerar ID único para a foto
      const id = customId || `${actionType}_${workOrderId || 'no_wo'}_${Date.now()}`;
      const fileName = `${id}.jpg`;
      const filePath = `${PHOTOS_DIR}${fileName}`;

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
      const size = fileInfo.size || 0;

      // Salvar metadados no SQLite
      await this.db.runAsync(
        'INSERT OR REPLACE INTO photo_storage (id, fileName, filePath, originalUri, size, timestamp, workOrderId, actionType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, fileName, filePath, photoUri, size, new Date().toISOString(), workOrderId, actionType]
      );

      console.log(`📸 Foto salva: ${fileName} (${size} bytes)`);
      return { id, filePath, success: true };
    } catch (error) {
      console.error('❌ Erro ao salvar foto:', error);
      return { id: '', filePath: '', success: false, error: error.message };
    }
  }

  /**
   * Recupera foto como base64
   */
  async getPhotoAsBase64(photoId: string): Promise<{ base64: string | null; error?: string }> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Buscar metadados da foto
      const result = await this.db.getFirstAsync<{ filePath: string }>(
        'SELECT filePath FROM photo_storage WHERE id = ?',
        [photoId]
      );

      if (!result) {
        return { base64: null, error: 'Foto não encontrada' };
      }

      // Verificar se o arquivo existe
      const fileInfo = await FileSystem.getInfoAsync(result.filePath);
      if (!fileInfo.exists) {
        return { base64: null, error: 'Arquivo de foto não encontrado' };
      }

      // Converter para base64
      const base64 = await FileSystem.readAsStringAsync(result.filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return { base64: `data:image/jpeg;base64,${base64}` };
    } catch (error) {
      console.error('❌ Erro ao recuperar foto:', error);
      return { base64: null, error: error.message };
    }
  }

  /**
   * Remove foto do sistema de arquivos e metadados do SQLite
   */
  async removePhoto(photoId: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Buscar metadados da foto
      const result = await this.db.getFirstAsync<{ filePath: string }>(
        'SELECT filePath FROM photo_storage WHERE id = ?',
        [photoId]
      );

      if (result) {
        // Remover arquivo se existir
        const fileInfo = await FileSystem.getInfoAsync(result.filePath);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(result.filePath);
        }
      }

      // Remover metadados do SQLite
      await this.db.runAsync('DELETE FROM photo_storage WHERE id = ?', [photoId]);
      console.log(`🗑️ Foto removida: ${photoId}`);
    } catch (error) {
      console.error('❌ Erro ao remover foto:', error);
      throw error;
    }
  }

  /**
   * Lista todas as fotos de uma OS específica
   */
  async getPhotosByWorkOrder(workOrderId: number): Promise<PhotoStorageItem[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      const results = await this.db.getAllAsync<PhotoStorageItem>(
        'SELECT * FROM photo_storage WHERE workOrderId = ? ORDER BY timestamp DESC',
        [workOrderId]
      );

      return results || [];
    } catch (error) {
      console.error('❌ Erro ao buscar fotos da OS:', error);
      return [];
    }
  }

  /**
   * Limpa dados antigos para liberar espaço
   */
  async cleanup(daysToKeep: number = 30): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)).toISOString();
      
      // Buscar fotos antigas para deletar arquivos
      const oldPhotos = await this.db.getAllAsync<{ id: string; filePath: string }>(
        'SELECT id, filePath FROM photo_storage WHERE timestamp < ?',
        [cutoffDate]
      );

      // Deletar arquivos de fotos antigas
      for (const photo of oldPhotos) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(photo.filePath);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(photo.filePath);
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao deletar arquivo antigo: ${photo.filePath}`);
        }
      }

      // Limpar dados antigos do SQLite
      await this.db.runAsync('DELETE FROM hybrid_storage WHERE timestamp < ?', [cutoffDate]);
      await this.db.runAsync('DELETE FROM photo_storage WHERE timestamp < ?', [cutoffDate]);
      
      console.log(`🧹 Limpeza concluída: ${oldPhotos.length} fotos antigas removidas`);
    } catch (error) {
      console.error('❌ Erro na limpeza:', error);
      throw error;
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
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Contar itens por tipo
      const storageStats = await this.db.getAllAsync<{ type: string; count: number; totalSize: number }>(
        'SELECT type, COUNT(*) as count, SUM(size) as totalSize FROM hybrid_storage GROUP BY type'
      );

      // Contar fotos
      const photoStats = await this.db.getFirstAsync<{ count: number; totalSize: number }>(
        'SELECT COUNT(*) as count, SUM(size) as totalSize FROM photo_storage'
      );

      const storageByType: { [type: string]: number } = {};
      let totalSize = 0;
      let totalItems = 0;

      for (const stat of storageStats) {
        storageByType[stat.type] = stat.totalSize || 0;
        totalSize += stat.totalSize || 0;
        totalItems += stat.count || 0;
      }

      return {
        totalItems,
        totalPhotos: photoStats?.count || 0,
        totalSize: totalSize + (photoStats?.totalSize || 0),
        storageByType
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
   * Migra dados do AsyncStorage para o armazenamento híbrido
   */
  async migrateFromAsyncStorage(keys: string[], type: 'cache' | 'offline_action' | 'work_order' | 'initial_data'): Promise<number> {
    await this.initialize();
    let migratedCount = 0;

    try {
      for (const key of keys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          await this.setItem(key, JSON.parse(data), type);
          migratedCount++;
          console.log(`📦 Migrado: ${key}`);
        }
      }
      
      console.log(`✅ Migração concluída: ${migratedCount} itens migrados`);
      return migratedCount;
    } catch (error) {
      console.error('❌ Erro na migração:', error);
      return migratedCount;
    }
  }
}

// Instância singleton do serviço
const hybridStorage = new HybridStorageService();

export default hybridStorage; 