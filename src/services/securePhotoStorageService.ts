import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// DIRETÓRIO SEGURO - não será limpo pelo sistema
const SECURE_PHOTOS_DIR = Platform.select({
  ios: `${FileSystem.documentDirectory}Library/Application Support/AppPhotos/`,
  android: `${FileSystem.documentDirectory}AppPhotos/`
}) as string; // Type assertion para garantir que não é undefined

const BACKUP_DIR = `${FileSystem.cacheDirectory}backup_photos/`;
const METADATA_KEY = 'secure_photos_metadata';

interface PhotoMetadata {
  id: string;
  filename: string;
  secureFilePath: string;
  backupFilePath?: string;
  workOrderId: number;
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'DADOS_RECORD' | 'AUDITORIA';
  timestamp: string;
  size: number;
  synced: boolean;
  originalUri?: string;
}

interface PhotoMetadataStorage {
  [photoId: string]: PhotoMetadata;
}

class SecurePhotoStorageService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Criar diretórios seguros
      await this.createDirectories();
      this.initialized = true;
      console.log('✅ SecurePhotoStorage inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar SecurePhotoStorage:', error);
      throw error;
    }
  }

  private async createDirectories(): Promise<void> {
    // Criar diretório principal seguro
    const secureInfo = await FileSystem.getInfoAsync(SECURE_PHOTOS_DIR);
    if (!secureInfo.exists) {
      await FileSystem.makeDirectoryAsync(SECURE_PHOTOS_DIR, { intermediates: true });
    }

    // Criar diretório de backup
    const backupInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!backupInfo.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
    }
  }

  /**
   * Salva foto de forma segura com backup automático
   */
  async savePhoto(
    originalUri: string,
    workOrderId: number,
    type: PhotoMetadata['type'],
    customId?: string
  ): Promise<{ success: boolean; photoId: string; error?: string }> {
    await this.initialize();

    const photoId = customId || `${type}_${workOrderId}_${Date.now()}`;
    const filename = `${photoId}.jpg`;
    const secureFilePath = `${SECURE_PHOTOS_DIR}${filename}`;
    const backupFilePath = `${BACKUP_DIR}${filename}`;

    try {
      // Verificar se arquivo original existe
      const originalInfo = await FileSystem.getInfoAsync(originalUri);
      if (!originalInfo.exists) {
        return { success: false, photoId, error: 'Arquivo original não encontrado' };
      }

      // 1. Salvar no diretório seguro
      await FileSystem.copyAsync({
        from: originalUri,
        to: secureFilePath
      });

      // 2. Criar backup
      await FileSystem.copyAsync({
        from: originalUri,
        to: backupFilePath
      });

      // 3. Obter tamanho
      const fileInfo = await FileSystem.getInfoAsync(secureFilePath);
      const size = fileInfo.exists ? ((fileInfo as any).size || 0) : 0;

      // 4. Salvar metadados
      const metadata: PhotoMetadata = {
        id: photoId,
        filename,
        secureFilePath,
        backupFilePath,
        workOrderId,
        type,
        timestamp: new Date().toISOString(),
        size,
        synced: false,
        originalUri
      };

      await this.saveMetadata(photoId, metadata);

      console.log(`📸 Foto salva com segurança: ${filename} (${size} bytes)`);
      return { success: true, photoId };

    } catch (error) {
      console.error(`❌ Erro ao salvar foto ${photoId}:`, error);
      return { success: false, photoId, error: error instanceof Error ? error.message : 'Erro desconhecido' };
    }
  }

  /**
   * Recupera foto como URI para exibição
   */
  async getPhotoUri(photoId: string): Promise<string | null> {
    await this.initialize();

    try {
      const metadata = await this.getMetadata(photoId);
      if (!metadata) return null;

      // Verificar se arquivo principal existe
      const mainExists = await FileSystem.getInfoAsync(metadata.secureFilePath);
      if (mainExists.exists) {
        return metadata.secureFilePath;
      }

      // Fallback para backup
      if (metadata.backupFilePath) {
        const backupExists = await FileSystem.getInfoAsync(metadata.backupFilePath);
        if (backupExists.exists) {
          console.warn(`⚠️ Usando backup para foto ${photoId}`);
          return metadata.backupFilePath;
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ Erro ao buscar foto ${photoId}:`, error);
      return null;
    }
  }

  /**
   * Converte foto para base64 (sob demanda)
   */
  async getPhotoAsBase64(photoId: string): Promise<string | null> {
    const uri = await this.getPhotoUri(photoId);
    if (!uri) return null;

    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error(`❌ Erro ao converter foto ${photoId} para base64:`, error);
      return null;
    }
  }

  /**
   * Lista fotos de uma OS específica
   */
  async getPhotosByWorkOrder(workOrderId: number): Promise<PhotoMetadata[]> {
    await this.initialize();

    try {
      const allMetadata = await this.getAllMetadata();
      return Object.values(allMetadata)
        .filter(photo => photo.workOrderId === workOrderId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`❌ Erro ao buscar fotos da OS ${workOrderId}:`, error);
      return [];
    }
  }

  /**
   * Marca foto como sincronizada
   */
  async markAsSynced(photoId: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(photoId);
      if (!metadata) return false;

      metadata.synced = true;
      await this.saveMetadata(photoId, metadata);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao marcar foto ${photoId} como sincronizada:`, error);
      return false;
    }
  }

  /**
   * Remove foto e cleanup
   */
  async deletePhoto(photoId: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(photoId);
      if (!metadata) return true; // Já removida

      // Remover arquivos
      try {
        await FileSystem.deleteAsync(metadata.secureFilePath, { idempotent: true });
      } catch {}
      
      if (metadata.backupFilePath) {
        try {
          await FileSystem.deleteAsync(metadata.backupFilePath, { idempotent: true });
        } catch {}
      }

      // Remover metadados
      await this.removeMetadata(photoId);
      
      console.log(`🗑️ Foto ${photoId} removida`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao remover foto ${photoId}:`, error);
      return false;
    }
  }

  /**
   * Limpeza de fotos antigas sincronizadas
   */
  async cleanupOldSyncedPhotos(daysOld: number = 30): Promise<number> {
    await this.initialize();

    try {
      const allMetadata = await this.getAllMetadata();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let cleanedCount = 0;
      
      for (const metadata of Object.values(allMetadata)) {
        if (metadata.synced && new Date(metadata.timestamp) < cutoffDate) {
          const deleted = await this.deletePhoto(metadata.id);
          if (deleted) cleanedCount++;
        }
      }

      console.log(`🧹 ${cleanedCount} fotos antigas limpas`);
      return cleanedCount;
    } catch (error) {
      console.error('❌ Erro na limpeza de fotos antigas:', error);
      return 0;
    }
  }

  // MÉTODOS PRIVADOS PARA METADADOS

  private async saveMetadata(photoId: string, metadata: PhotoMetadata): Promise<void> {
    const allMetadata = await this.getAllMetadata();
    allMetadata[photoId] = metadata;
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));
  }

  private async getMetadata(photoId: string): Promise<PhotoMetadata | null> {
    const allMetadata = await this.getAllMetadata();
    return allMetadata[photoId] || null;
  }

  private async removeMetadata(photoId: string): Promise<void> {
    const allMetadata = await this.getAllMetadata();
    delete allMetadata[photoId];
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));
  }

  private async getAllMetadata(): Promise<PhotoMetadataStorage> {
    try {
      const data = await AsyncStorage.getItem(METADATA_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('❌ Erro ao buscar metadados de fotos:', error);
      return {};
    }
  }

  /**
   * Diagnóstico do sistema
   */
  async getDiagnostics(): Promise<{
    totalPhotos: number;
    syncedPhotos: number;
    pendingPhotos: number;
    totalSize: number;
    storageHealth: 'good' | 'warning' | 'critical';
  }> {
    await this.initialize();

    try {
      const allMetadata = await this.getAllMetadata();
      const photos = Object.values(allMetadata);
      
      const totalPhotos = photos.length;
      const syncedPhotos = photos.filter(p => p.synced).length;
      const pendingPhotos = totalPhotos - syncedPhotos;
      const totalSize = photos.reduce((sum, p) => sum + p.size, 0);

      // Verificar integridade dos arquivos
      let missingFiles = 0;
      for (const photo of photos) {
        const exists = await FileSystem.getInfoAsync(photo.secureFilePath);
        if (!exists.exists) missingFiles++;
      }

      const storageHealth = missingFiles === 0 ? 'good' : 
                           missingFiles < totalPhotos * 0.1 ? 'warning' : 'critical';

      return {
        totalPhotos,
        syncedPhotos,
        pendingPhotos,
        totalSize,
        storageHealth
      };
    } catch (error) {
      console.error('❌ Erro no diagnóstico:', error);
      return {
        totalPhotos: 0,
        syncedPhotos: 0,
        pendingPhotos: 0,
        totalSize: 0,
        storageHealth: 'critical'
      };
    }
  }
}

// Singleton
const securePhotoStorage = new SecurePhotoStorageService();
export default securePhotoStorage; 