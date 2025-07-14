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

// Interface para operações da fila
interface QueueOperation {
  id: string;
  operation: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class HybridStorageService {
  private db: SQLite.SQLiteDatabase | null = null;
  private initialized = false;
  private operationQueue: QueueOperation[] = [];
  private isProcessingQueue = false;

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
   * Adiciona uma operação à fila e a processa
   */
  private async queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const queueItem: QueueOperation = {
        id,
        operation,
        resolve,
        reject
      };

      this.operationQueue.push(queueItem);
      this.processQueue();
    });
  }

  /**
   * Processa a fila de operações sequencialmente
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.operationQueue.length > 0) {
      const queueItem = this.operationQueue.shift();
      if (!queueItem) break;

      try {
        const result = await queueItem.operation();
        queueItem.resolve(result);
      } catch (error) {
        queueItem.reject(error);
      }
    }

    this.isProcessingQueue = false;
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

    return this.queueOperation(async () => {
      const serializedData = JSON.stringify(data);
      const size = new Blob([serializedData]).size;
      
      await this.db!.runAsync(
        'INSERT OR REPLACE INTO hybrid_storage (key, data, type, timestamp, size) VALUES (?, ?, ?, ?, ?)',
        [key, serializedData, type, new Date().toISOString(), size]
      );
      
      console.log(`💾 Dados salvos no SQLite: ${key} (${size} bytes)`);
    });
  }

  /**
   * Recupera dados estruturados do SQLite
   */
  async getItem<T = any>(key: string): Promise<T | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      const result = await this.db!.getFirstAsync<{ data: string }>(
        'SELECT data FROM hybrid_storage WHERE key = ?',
        [key]
      );
      
      if (!result) return null;
      
      return JSON.parse(result.data) as T;
    });
  }

  /**
   * Remove dados estruturados do SQLite
   */
  async removeItem(key: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      await this.db!.runAsync('DELETE FROM hybrid_storage WHERE key = ?', [key]);
      console.log(`🗑️ Dados removidos do SQLite: ${key}`);
    });
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

    return this.queueOperation(async () => {
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
      const size = fileInfo.exists ? ((fileInfo as any).size || 0) : 0;

      // Salvar metadados no SQLite
      await this.db!.runAsync(
        'INSERT OR REPLACE INTO photo_storage (id, fileName, filePath, originalUri, size, timestamp, workOrderId, actionType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, fileName, filePath, photoUri, size, new Date().toISOString(), workOrderId, actionType]
      );

      console.log(`📸 Foto salva: ${fileName} (${size} bytes)`);
      return { id, filePath, success: true };
    });
  }

  /**
   * Recupera foto como base64
   */
  async getPhotoAsBase64(photoId: string): Promise<{ base64: string | null; error?: string }> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      // Buscar metadados da foto
      const result = await this.db!.getFirstAsync<{ filePath: string }>(
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
    });
  }

  /**
   * Remove foto do sistema de arquivos e metadados do SQLite
   */
  async removePhoto(photoId: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      // Buscar metadados da foto
      const result = await this.db!.getFirstAsync<{ filePath: string }>(
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
      await this.db!.runAsync('DELETE FROM photo_storage WHERE id = ?', [photoId]);
      console.log(`🗑️ Foto removida: ${photoId}`);
    });
  }

  /**
   * Lista todas as fotos de uma OS específica
   */
  async getPhotosByWorkOrder(workOrderId: number): Promise<PhotoStorageItem[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      const results = await this.db!.getAllAsync<PhotoStorageItem>(
        'SELECT * FROM photo_storage WHERE workOrderId = ? ORDER BY timestamp DESC',
        [workOrderId]
      );

      return results || [];
    });
  }

  /**
   * Limpa dados antigos para liberar espaço
   */
  async cleanup(daysToKeep: number = 30): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)).toISOString();
      
      // Buscar fotos antigas para deletar arquivos
      const oldPhotos = await this.db!.getAllAsync<{ id: string; filePath: string }>(
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
      await this.db!.runAsync('DELETE FROM hybrid_storage WHERE timestamp < ?', [cutoffDate]);
      await this.db!.runAsync('DELETE FROM photo_storage WHERE timestamp < ?', [cutoffDate]);
      
      console.log(`🧹 Limpeza concluída: ${oldPhotos.length} fotos antigas removidas`);
    });
  }

  /**
   * Obtém estatísticas simplificadas de armazenamento
   */
  async getStorageStats(): Promise<{
    totalItems: number;
    totalPhotos: number;
    totalSize: number;
    storageByType: { [type: string]: number };
  }> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return this.queueOperation(async () => {
      try {
        // Contar itens por tipo de forma simplificada
        const itemsCount = await this.db!.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM hybrid_storage'
        );

        const photosCount = await this.db!.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM photo_storage'
        );

        // Obter tamanho total de forma simplificada (sem agrupar por tipo para evitar CursorWindow)
        const totalSizeResult = await this.db!.getFirstAsync<{ totalSize: number }>(
          'SELECT SUM(size) as totalSize FROM hybrid_storage'
        );

        const photosSizeResult = await this.db!.getFirstAsync<{ totalSize: number }>(
          'SELECT SUM(size) as totalSize FROM photo_storage'
        );

        // Tipos básicos sem detalhamento excessivo
        const storageByType = {
          'items': totalSizeResult?.totalSize || 0,
          'photos': photosSizeResult?.totalSize || 0
        };

        return {
          totalItems: itemsCount?.count || 0,
          totalPhotos: photosCount?.count || 0,
          totalSize: (totalSizeResult?.totalSize || 0) + (photosSizeResult?.totalSize || 0),
          storageByType
        };
      } catch (error) {
        console.error('❌ Erro ao obter estatísticas simplificadas:', error);
        // Retornar estatísticas básicas em caso de erro
        return {
          totalItems: 0,
          totalPhotos: 0,
          totalSize: 0,
          storageByType: {}
        };
      }
    });
  }

  /**
   * Migra dados do AsyncStorage para o armazenamento híbrido
   */
  async migrateFromAsyncStorage(keys: string[], type: 'cache' | 'offline_action' | 'work_order' | 'initial_data'): Promise<number> {
    await this.initialize();
    let migratedCount = 0;

    return this.queueOperation(async () => {
      for (const key of keys) {
        try {
          const data = await AsyncStorage.getItem(key);
          if (data) {
            // Aqui não podemos usar setItem pois ele também usa queueOperation
            // Precisamos fazer a operação diretamente no SQLite
            const serializedData = JSON.stringify(JSON.parse(data));
            const size = new Blob([serializedData]).size;
            
            await this.db!.runAsync(
              'INSERT OR REPLACE INTO hybrid_storage (key, data, type, timestamp, size) VALUES (?, ?, ?, ?, ?)',
              [key, serializedData, type, new Date().toISOString(), size]
            );
            
            migratedCount++;
            console.log(`📦 Migrado: ${key}`);
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao migrar ${key}:`, error);
        }
      }
      
      console.log(`✅ Migração concluída: ${migratedCount} itens migrados`);
      return migratedCount;
    });
  }
}

// Instância singleton do serviço
const hybridStorage = new HybridStorageService();

export default hybridStorage; 