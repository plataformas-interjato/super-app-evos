import photoMigrationAdapter from './photoMigrationAdapter';
import securePhotoStorage from './securePhotoStorageService';
import { checkNetworkConnection } from './offlineService';
import { saveDadosRecord } from './serviceStepsService';

/**
 * SERVIÇO INTEGRADO - Mantém compatibilidade total + adiciona segurança
 * 
 * Este serviço substitui gradualmente as funções do offlineService
 * sem quebrar o código existente.
 */

// INTERFACES COMPATÍVEIS
export interface OfflinePhotoResult {
  success: boolean;
  photoId: string;
  error?: string;
  savedOffline?: boolean;
}

export interface PhotoSyncResult {
  success: boolean;
  synced: number;
  errors: string[];
}

/**
 * SUBSTITUTO SEGURO para savePhotoInicioOffline
 * API 100% COMPATÍVEL + armazenamento seguro
 */
// Validação de Funcionalidade: Foto inicial - Salvar local e sincronizar somente ao avançar de página (evitar múltiplos envios). Validado pelo usuário. Não alterar sem nova validação.
export const savePhotoInicioOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<OfflinePhotoResult> => {
  
  try {
    // 1. Usar sistema seguro através do adaptador
    const result = await photoMigrationAdapter.savePhotoInicioSafe(
      workOrderId,
      technicoId,
      photoUri
    );

    // 2. NÃO SINCRONIZAR AQUI. Sincronização ocorrerá somente ao avançar de página
    // (comportamento solicitado pelo usuário)

    return {
      success: result.success,
      photoId: result.photoId,
      error: result.error,
      savedOffline: true
    };

  } catch (error) {
    return {
      success: false,
      photoId: '',
      error: error instanceof Error ? error.message : 'Erro inesperado',
      savedOffline: true
    };
  }
};

/**
 * SUBSTITUTO SEGURO para saveDadosRecordOffline
 * API 100% COMPATÍVEL + armazenamento seguro
 */
export const saveDadosRecordOffline = async (
  workOrderId: number,
  technicoId: string,
  entradaDadosId: number,
  photoUri: string
): Promise<OfflinePhotoResult> => {
  
  console.log('📸 [SEGURO] Salvando dados record...');
  
  try {
    // Usar sistema seguro
    const result = await photoMigrationAdapter.saveDadosRecordSafe(
      workOrderId,
      technicoId,
      entradaDadosId,
      photoUri
    );

    // Tentar sincronização imediata se online
    const isOnline = await checkNetworkConnection();
    if (isOnline && result.success) {
      syncDadosRecordInBackground(result.photoId, workOrderId, entradaDadosId).catch(error => {
        console.warn('⚠️ Erro na sincronização de dados em background:', error);
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Erro no saveDadosRecordOffline seguro:', error);
    return {
      success: false,
      photoId: `error_${Date.now()}`,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

/**
 * SUBSTITUTO SEGURO para savePhotoFinalOffline
 * API 100% COMPATÍVEL + armazenamento seguro
 */
export const savePhotoFinalOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<OfflinePhotoResult> => {
  
  try {
    // 1. Usar sistema seguro através do adaptador
    const result = await photoMigrationAdapter.savePhotoFinalSafe(
      workOrderId,
      technicoId,
      photoUri
    );

    // 2. Se está online, tentar sincronizar imediatamente
    const isOnline = await checkNetworkConnection();
    if (isOnline && result.success) {
      // Tentar sync em background sem bloquear
      setTimeout(() => {
        syncPhotoFinalInBackground(result.photoId, workOrderId, technicoId);
      }, 500);
    }

    return {
      success: result.success,
      photoId: result.photoId,
      error: result.error,
      savedOffline: !isOnline
    };

  } catch (error) {
    return {
      success: false,
      photoId: '',
      error: error instanceof Error ? error.message : 'Erro inesperado',
      savedOffline: true
    };
  }
};

/**
 * RECUPERAÇÃO INTELIGENTE de fotos
 * Busca no sistema seguro primeiro, fallback para legado
 */
export const getPhotoForDisplay = async (
  photoId: string
): Promise<{
  uri: string | null;
  base64: string | null;
  source: 'secure' | 'legacy' | 'none';
}> => {
  
  try {
    const result = await photoMigrationAdapter.getPhoto(photoId);
    
    if (result.found && result.uri) {
      // Se encontrou URI, converter para base64 se necessário
      let base64 = null;
      if (result.source === 'secure') {
        base64 = await securePhotoStorage.getPhotoAsBase64(photoId);
      }
      
      return {
        uri: result.uri,
        base64,
        source: result.source
      };
    }

    return {
      uri: null,
      base64: null,
      source: 'none'
    };

  } catch (error) {
    console.error(`❌ Erro ao buscar foto ${photoId}:`, error);
    return {
      uri: null,
      base64: null,
      source: 'none'
    };
  }
};

/**
 * SINCRONIZAÇÃO INTELIGENTE - Prioriza fotos não sincronizadas
 */
export const syncOfflinePhotos = async (): Promise<PhotoSyncResult> => {
  console.log('🔄 [SEGURO] Iniciando sincronização de fotos...');
  
  try {
    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
      console.log('📱 Sem conexão - pulando sincronização');
      return { success: true, synced: 0, errors: [] };
    }

    let totalSynced = 0;
    const errors: string[] = [];

    // 1. Sincronizar fotos do sistema seguro
    const securePhotos = await syncSecurePhotos();
    totalSynced += securePhotos.synced;
    errors.push(...securePhotos.errors);

    // 2. Migrar e sincronizar fotos legadas em lotes pequenos
    const migrationResult = await photoMigrationAdapter.migrateBatchPhotos(5);
    if (migrationResult.migrated > 0) {
      console.log(`🔄 ${migrationResult.migrated} fotos migradas neste lote`);
    }
    errors.push(...migrationResult.errors);

    console.log(`✅ Sincronização concluída: ${totalSynced} fotos`);
    return { success: true, synced: totalSynced, errors };

  } catch (error) {
    console.error('❌ Erro na sincronização de fotos:', error);
    return { success: false, synced: 0, errors: [error instanceof Error ? error.message : 'Erro desconhecido'] };
  }
};

/**
 * LIMPEZA AUTOMÁTICA - Remove fotos antigas sincronizadas
 */
export const cleanupOldPhotos = async (daysOld: number = 30): Promise<number> => {
  console.log(`🧹 Limpando fotos antigas (>${daysOld} dias)...`);
  
  try {
    const cleaned = await securePhotoStorage.cleanupOldSyncedPhotos(daysOld);
    console.log(`🧹 ${cleaned} fotos antigas removidas`);
    return cleaned;
  } catch (error) {
    console.error('❌ Erro na limpeza de fotos:', error);
    return 0;
  }
};

/**
 * DIAGNÓSTICO COMPLETO do sistema de fotos
 */
export const getPhotoSystemDiagnostics = async (): Promise<{
  secure: any;
  migration: any;
  recommendations: string[];
}> => {
  
  try {
    const [secureDiag, migrationStatus] = await Promise.all([
      securePhotoStorage.getDiagnostics(),
      photoMigrationAdapter.getMigrationStatus()
    ]);

    const recommendations: string[] = [];

    // Análise e recomendações
    if (secureDiag.storageHealth === 'critical') {
      recommendations.push('❌ CRÍTICO: Arquivos de fotos corrompidos detectados');
    }
    
    if (migrationStatus.pendingMigration > 50) {
      recommendations.push('📦 Migrar fotos legadas em background');
    }
    
    if (secureDiag.pendingPhotos > 100) {
      recommendations.push('🔄 Sincronizar fotos pendentes');
    }
    
    if (secureDiag.totalSize > 500 * 1024 * 1024) { // 500MB
      recommendations.push('🧹 Executar limpeza de fotos antigas');
    }

    return {
      secure: secureDiag,
      migration: migrationStatus,
      recommendations
    };

  } catch (error) {
    console.error('❌ Erro no diagnóstico:', error);
    return {
      secure: { storageHealth: 'critical' },
      migration: { migrationProgress: 0 },
      recommendations: ['❌ Erro no diagnóstico do sistema']
    };
  }
};

// FUNÇÕES PRIVADAS PARA SINCRONIZAÇÃO EM BACKGROUND

// Validação de Funcionalidade: Foto inicial - Inserir/atualizar no Supabase pela mesma linha (ordem_servico_id + auditor_id). Validado pelo usuário. Não alterar sem nova validação.
async function syncPhotoInicioInBackground(
  photoId: string,
  workOrderId: number,
  technicoId: string
): Promise<void> {
  
  try {
    const base64 = await securePhotoStorage.getPhotoAsBase64(photoId);
    if (!base64) {
      throw new Error('Foto não encontrada para sincronização');
    }

    // Enviar para o Supabase utilizando o serviço de auditoria (foto inicial)
    const { savePhotoInicio } = await import('./auditService');
    const { error } = await savePhotoInicio(
      workOrderId,
      technicoId.toString(),
      base64
    );

    if (error) {
      throw new Error(`Erro ao salvar foto inicial no Supabase: ${error}`);
    }
    
    // Marcar como sincronizada
    await securePhotoStorage.markAsSynced(photoId);

  } catch (error) {
    // Propagar erro para controle do chamador
    throw error;
  }
}

async function syncDadosRecordInBackground(
  photoId: string,
  workOrderId: number,
  entradaDadosId: number
): Promise<void> {
  
  try {
    const base64 = await securePhotoStorage.getPhotoAsBase64(photoId);
    if (!base64) {
      throw new Error('Foto não encontrada para sincronização');
    }

    // Salvar na tabela dados
    const { data, error } = await saveDadosRecord(workOrderId, entradaDadosId, base64);
    
    if (error) {
      throw new Error(`Erro ao salvar no Supabase: ${error}`);
    }

    // Marcar como sincronizada
    await securePhotoStorage.markAsSynced(photoId);
    console.log(`✅ Dados record sincronizado: ${photoId} -> Supabase ID: ${data?.id}`);

  } catch (error) {
    console.error(`❌ Erro na sincronização de dados: ${photoId}`, error);
    throw error;
  }
}

async function syncPhotoFinalInBackground(
  photoId: string,
  workOrderId: number,
  technicoId: string
): Promise<void> {
  
  try {
    console.log(`🔄 [SYNC] Iniciando sincronização de foto final:`, {
      photoId,
      workOrderId,
      technicoId,
      technicoIdType: typeof technicoId
    });

    const base64 = await securePhotoStorage.getPhotoAsBase64(photoId);
    if (!base64) {
      throw new Error('Foto final não encontrada para sincronização');
    }

    console.log(`📸 [SYNC] Foto final base64 obtida, tamanho: ${base64.length} chars`);

    // Importar função para salvar auditoria final
    const { saveAuditoriaFinal } = await import('./auditService');
    
    console.log(`💾 [SYNC] Chamando saveAuditoriaFinal com parâmetros:`, {
      workOrderId,
      technicoId: technicoId.toString(), // Garantir que é string
      trabalhoRealizado: true,
      base64Length: base64.length
    });

    // Salvar auditoria final no Supabase
    const { data, error } = await saveAuditoriaFinal(
      workOrderId,
      technicoId.toString(), // Garantir conversão para string
      base64,
      true, // trabalhoRealizado
      '', // motivo
      '' // comentario
    );
    
    if (error) {
      console.error(`❌ [SYNC] Erro retornado por saveAuditoriaFinal:`, error);
      throw new Error(`Erro ao salvar auditoria final no Supabase: ${error}`);
    }

    if (!data) {
      console.error(`❌ [SYNC] saveAuditoriaFinal retornou data null`);
      throw new Error('saveAuditoriaFinal retornou data null');
    }

    // Marcar como sincronizada
    await securePhotoStorage.markAsSynced(photoId);
    console.log(`✅ [SYNC] Foto final sincronizada com sucesso:`, {
      photoId,
      supabaseId: data?.id,
      workOrderId
    });

  } catch (error) {
    console.error(`❌ [SYNC] Erro completo na sincronização de foto final:`, {
      photoId,
      workOrderId,
      technicoId,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

async function syncSecurePhotos(): Promise<PhotoSyncResult> {
  // Implementação para sincronizar fotos do sistema seguro
  // Buscar fotos não sincronizadas e enviar para Supabase
  
  try {
    // Esta é uma implementação simplificada
    // Na prática, você buscaria todas as fotos não sincronizadas
    // e as processaria em lotes
    
    return { success: true, synced: 0, errors: [] };
    
  } catch (error) {
    console.error('❌ Erro ao sincronizar fotos seguras:', error);
    return { success: false, synced: 0, errors: [error instanceof Error ? error.message : 'Erro desconhecido'] };
  }
}

// Validação de Funcionalidade: Foto inicial - Ao avançar, sincroniza apenas a última e marca anteriores como sincronizadas para garantir 1 foto efetiva por OS. Validado pelo usuário. Não alterar sem nova validação.
export async function syncInitialPhotoForWorkOrder(
  workOrderId: number,
  technicoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const photos = await securePhotoStorage.getPhotosByWorkOrder(workOrderId);
    const pendingInitial = photos
      .filter((p: any) => p.type === 'PHOTO_INICIO' && !p.synced)
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (pendingInitial.length === 0) {
      return { success: true };
    }

    const latest = pendingInitial[pendingInitial.length - 1];
    await syncPhotoInicioInBackground(latest.id, workOrderId, technicoId);

    // Marcar as demais fotos iniciais pendentes como sincronizadas para evitar múltiplos envios
    const older = pendingInitial.slice(0, -1);
    for (const photo of older) {
      await securePhotoStorage.markAsSynced(photo.id);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
}

// EXPORTAÇÕES PARA COMPATIBILIDADE COMPLETA
export {
  syncOfflinePhotos as syncOfflineActions,
  cleanupOldPhotos as cleanOrphanedOfflineData,
  checkNetworkConnection // Adicionar para compatibilidade
};

// RE-EXPORTAR FUNÇÕES DO OFFLINESERVICE ORIGINAL (para compatibilidade total)
export {
  getOfflineActions,
  syncAllPendingActions,
  isSyncInProgress,
  getSyncStats,
  forceStopSync,
  clearFailedActions,
  retryFailedActions,
  clearAllOfflineActions,
  getRemainingActionsCount,
  startAutoSync,
  debugSyncStatusForWorkOrder,
  forceSyncPhotosForWorkOrder,
  registerSyncCallback,
  registerOSFinalizadaCallback,
  saveChecklistEtapaOffline,
  saveComentarioEtapaOffline,
  saveAuditoriaFinalOffline,
  syncOfflineDadosRecords,
  syncFotosExtrasOffline,
  debugFullDiagnosticAndSync,
  clearOfflineActionsForWorkOrder,
  notifyOSFinalizadaCallbacks
} from './offlineService'; 