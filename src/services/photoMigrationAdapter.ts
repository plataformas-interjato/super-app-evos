import securePhotoStorage from './securePhotoStorageService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Chaves dos sistemas legados
const LEGACY_KEYS = {
  OFFLINE_ACTIONS: 'offline_actions',
  OFFLINE_DADOS_RECORDS: 'offline_dados_records',
  OFFLINE_FOTOS_EXTRAS: 'offline_fotos_extras',
  PHOTO_PREFIX: 'photo_'
};

interface LegacyPhotoAction {
  id: string;
  type: string;
  workOrderId: number;
  data: {
    photoUri?: string;
    photoBase64?: string;
  };
  synced: boolean;
}

class PhotoMigrationAdapter {
  private migrationInProgress = false;

  /**
   * Migra uma foto do sistema legado para o seguro
   * COMPATÍVEL com todos os sistemas existentes
   */
  async migratePhotoFromLegacy(
    originalUri: string,
    workOrderId: number,
    type: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'DADOS_RECORD' | 'AUDITORIA',
    legacyId?: string
  ): Promise<{ success: boolean; newPhotoId: string; error?: string }> {
    
    try {
      // Salvar no novo sistema
      const result = await securePhotoStorage.savePhoto(
        originalUri,
        workOrderId,
        type,
        legacyId
      );

      if (result.success) {
        console.log(`🔄 Foto migrada: ${legacyId} -> ${result.photoId}`);
        return {
          success: true,
          newPhotoId: result.photoId
        };
      } else {
        return {
          success: false,
          newPhotoId: result.photoId,
          error: result.error
        };
      }
    } catch (error) {
      console.error(`❌ Erro na migração da foto ${legacyId}:`, error);
      return {
        success: false,
        newPhotoId: legacyId || 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Wrapper compatível para savePhotoInicioOffline
   * MANTÉM API EXISTENTE + adiciona ao sistema seguro
   */
  async savePhotoInicioSafe(
    workOrderId: number,
    technicoId: string,
    photoUri: string
  ): Promise<{ success: boolean; photoId: string; error?: string; savedOffline?: boolean }> {
    
    try {
      // 1. Salvar no sistema seguro (NOVO)
      const secureResult = await securePhotoStorage.savePhoto(
        photoUri,
        workOrderId,
        'PHOTO_INICIO'
      );

      if (!secureResult.success) {
        console.error('❌ Falha ao salvar no sistema seguro, usando fallback');
        // Fallback para sistema legado se necessário
        return await this.fallbackToLegacySystem(workOrderId, technicoId, photoUri, 'PHOTO_INICIO');
      }

      // 2. Também salvar referência no sistema legado para compatibilidade
      await this.saveLegacyReference(secureResult.photoId, workOrderId, technicoId, 'PHOTO_INICIO');

      return {
        success: true,
        photoId: secureResult.photoId,
        savedOffline: true
      };

    } catch (error) {
      console.error('❌ Erro no savePhotoInicioSafe:', error);
      // Fallback completo para sistema legado
      return await this.fallbackToLegacySystem(workOrderId, technicoId, photoUri, 'PHOTO_INICIO');
    }
  }

  /**
   * Wrapper compatível para saveDadosRecordOffline
   */
  async saveDadosRecordSafe(
    workOrderId: number,
    technicoId: string,
    entradaDadosId: number,
    photoUri: string
  ): Promise<{ success: boolean; photoId: string; error?: string; savedOffline?: boolean }> {
    
    try {
      // Salvar no sistema seguro
      const secureResult = await securePhotoStorage.savePhoto(
        photoUri,
        workOrderId,
        'DADOS_RECORD',
        `dados_${workOrderId}_${entradaDadosId}_${Date.now()}`
      );

      if (!secureResult.success) {
        console.error('❌ Falha ao salvar dados no sistema seguro, usando fallback');
        return await this.fallbackToLegacySystem(workOrderId, technicoId, photoUri, 'DADOS_RECORD');
      }

      // Salvar referência legada
      await this.saveLegacyReference(secureResult.photoId, workOrderId, technicoId, 'DADOS_RECORD', entradaDadosId);

      return {
        success: true,
        photoId: secureResult.photoId,
        savedOffline: true
      };

    } catch (error) {
      console.error('❌ Erro no saveDadosRecordSafe:', error);
      return await this.fallbackToLegacySystem(workOrderId, technicoId, photoUri, 'DADOS_RECORD');
    }
  }

  /**
   * Wrapper compatível para savePhotoFinalOffline
   * MANTÉM API EXISTENTE + adiciona ao sistema seguro
   */
  async savePhotoFinalSafe(
    workOrderId: number,
    technicoId: string,
    photoUri: string
  ): Promise<{ success: boolean; photoId: string; error?: string; savedOffline?: boolean }> {
    
    try {
      // 1. Salvar no sistema seguro (NOVO)
      const secureResult = await securePhotoStorage.savePhoto(
        photoUri,
        workOrderId,
        'PHOTO_FINAL'
      );

      if (!secureResult.success) {
        console.error('❌ Falha ao salvar foto final no sistema seguro, usando fallback');
        // Fallback para sistema legado se necessário
        return await this.fallbackToLegacySystem(workOrderId, technicoId, photoUri, 'PHOTO_FINAL');
      }

      // 2. Também salvar referência no sistema legado para compatibilidade
      await this.saveLegacyReference(secureResult.photoId, workOrderId, technicoId, 'PHOTO_FINAL');

      return {
        success: true,
        photoId: secureResult.photoId,
        savedOffline: true
      };

    } catch (error) {
      console.error('❌ Erro no savePhotoFinalSafe:', error);
      // Fallback completo para sistema legado
      return await this.fallbackToLegacySystem(workOrderId, technicoId, photoUri, 'PHOTO_FINAL');
    }
  }

  /**
   * Recupera foto (tenta sistema seguro primeiro, fallback para legado)
   */
  async getPhoto(photoId: string): Promise<{
    uri?: string;
    base64?: string;
    found: boolean;
    source: 'secure' | 'legacy' | 'none';
  }> {
    
    // 1. Tentar sistema seguro primeiro
    try {
      const secureUri = await securePhotoStorage.getPhotoUri(photoId);
      if (secureUri) {
        return {
          uri: secureUri,
          found: true,
          source: 'secure'
        };
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao buscar no sistema seguro: ${error}`);
    }

    // 2. Fallback para sistema legado
    try {
      const legacyData = await AsyncStorage.getItem(`photo_${photoId}`);
      if (legacyData) {
        const parsed = JSON.parse(legacyData);
        return {
          uri: parsed.filePath || parsed.originalUri,
          found: true,
          source: 'legacy'
        };
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao buscar no sistema legado: ${error}`);
    }

    return { found: false, source: 'none' };
  }

  /**
   * Migração em lote das fotos existentes
   */
  async migrateBatchPhotos(
    batchSize: number = 10
  ): Promise<{
    processed: number;
    migrated: number;
    errors: string[];
    completed: boolean;
  }> {
    
    if (this.migrationInProgress) {
      return { processed: 0, migrated: 0, errors: ['Migração já em andamento'], completed: false };
    }

    this.migrationInProgress = true;
    
    try {
      const results = {
        processed: 0,
        migrated: 0,
        errors: [] as string[],
        completed: false
      };

      // Migrar ações offline
      const offlineActions = await this.getLegacyOfflineActions();
      const photoActions = Object.entries(offlineActions)
        .filter(([_, action]) => this.isPhotoAction(action))
        .slice(0, batchSize);

      for (const [actionId, action] of photoActions) {
        try {
          const photoUri = action.data.photoUri;
          if (photoUri) {
            const migrateResult = await this.migratePhotoFromLegacy(
              photoUri,
              action.workOrderId,
              this.mapActionTypeToSecure(action.type),
              actionId
            );

            if (migrateResult.success) {
              results.migrated++;
              // Atualizar referência no sistema legado
              await this.updateLegacyActionReference(actionId, migrateResult.newPhotoId);
            } else {
              results.errors.push(`${actionId}: ${migrateResult.error}`);
            }
          }
          results.processed++;
        } catch (error) {
          results.errors.push(`${actionId}: ${error.message}`);
          results.processed++;
        }
      }

      results.completed = photoActions.length < batchSize;
      
      console.log(`🔄 Lote migrado: ${results.migrated}/${results.processed} fotos`);
      return results;

    } finally {
      this.migrationInProgress = false;
    }
  }

  // MÉTODOS PRIVADOS

  private async fallbackToLegacySystem(
    workOrderId: number,
    technicoId: string,
    photoUri: string,
    type: string
  ): Promise<{ success: boolean; photoId: string; error?: string; savedOffline?: boolean }> {
    
    const actionId = `${type.toLowerCase()}_${workOrderId}_${technicoId}_${Date.now()}`;
    
    try {
      const legacyAction = {
        id: actionId,
        type,
        timestamp: new Date().toISOString(),
        workOrderId,
        technicoId,
        data: { photoUri },
        synced: false,
        attempts: 0
      };

      // Salvar no sistema legado
      const existingActions = await this.getLegacyOfflineActions();
      existingActions[actionId] = legacyAction;
      await AsyncStorage.setItem(LEGACY_KEYS.OFFLINE_ACTIONS, JSON.stringify(existingActions));

      console.log(`📦 Fallback: foto salva no sistema legado`);
      return {
        success: true,
        photoId: actionId,
        savedOffline: true
      };

    } catch (error) {
      console.error('❌ Erro no fallback para sistema legado:', error);
      return {
        success: false,
        photoId: actionId,
        error: error.message
      };
    }
  }

  private async saveLegacyReference(
    securePhotoId: string,
    workOrderId: number,
    technicoId: string,
    type: string,
    entradaDadosId?: number
  ): Promise<void> {
    
    try {
      const referenceKey = `secure_photo_ref_${securePhotoId}`;
      const reference = {
        securePhotoId,
        workOrderId,
        technicoId,
        type,
        entradaDadosId,
        timestamp: new Date().toISOString()
      };

      await AsyncStorage.setItem(referenceKey, JSON.stringify(reference));
    } catch (error) {
      console.warn('⚠️ Erro ao salvar referência legada:', error);
      // Não falhar a operação principal por isso
    }
  }

  private async getLegacyOfflineActions(): Promise<{ [key: string]: LegacyPhotoAction }> {
    try {
      const data = await AsyncStorage.getItem(LEGACY_KEYS.OFFLINE_ACTIONS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('❌ Erro ao buscar ações legadas:', error);
      return {};
    }
  }

  private isPhotoAction(action: any): boolean {
    return action.type && ['PHOTO_INICIO', 'PHOTO_FINAL', 'DADOS_RECORD'].includes(action.type);
  }

  private mapActionTypeToSecure(type: string): 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'DADOS_RECORD' | 'AUDITORIA' {
    switch (type) {
      case 'PHOTO_INICIO': return 'PHOTO_INICIO';
      case 'PHOTO_FINAL': return 'PHOTO_FINAL';
      case 'DADOS_RECORD': return 'DADOS_RECORD';
      default: return 'AUDITORIA';
    }
  }

  private async updateLegacyActionReference(actionId: string, newPhotoId: string): Promise<void> {
    try {
      const actions = await this.getLegacyOfflineActions();
      if (actions[actionId]) {
        actions[actionId].data.securePhotoId = newPhotoId;
        await AsyncStorage.setItem(LEGACY_KEYS.OFFLINE_ACTIONS, JSON.stringify(actions));
      }
    } catch (error) {
      console.warn('⚠️ Erro ao atualizar referência legada:', error);
    }
  }

  /**
   * Diagnóstico da migração
   */
  async getMigrationStatus(): Promise<{
    totalLegacyPhotos: number;
    migratedPhotos: number;
    pendingMigration: number;
    migrationProgress: number;
  }> {
    
    try {
      const legacyActions = await this.getLegacyOfflineActions();
      const photoActions = Object.values(legacyActions).filter(action => this.isPhotoAction(action));
      const totalLegacyPhotos = photoActions.length;

      // Contar quantas já foram migradas
      let migratedPhotos = 0;
      for (const action of photoActions) {
        if (action.data.securePhotoId) {
          migratedPhotos++;
        }
      }

      const pendingMigration = totalLegacyPhotos - migratedPhotos;
      const migrationProgress = totalLegacyPhotos > 0 ? (migratedPhotos / totalLegacyPhotos) * 100 : 100;

      return {
        totalLegacyPhotos,
        migratedPhotos,
        pendingMigration,
        migrationProgress
      };

    } catch (error) {
      console.error('❌ Erro ao obter status da migração:', error);
      return {
        totalLegacyPhotos: 0,
        migratedPhotos: 0,
        pendingMigration: 0,
        migrationProgress: 0
      };
    }
  }
}

// Singleton
const photoMigrationAdapter = new PhotoMigrationAdapter();
export default photoMigrationAdapter; 