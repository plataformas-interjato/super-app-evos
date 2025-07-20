import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { AuditoriaTecnico, savePhotoInicio, saveAuditoriaFinal } from './auditService';
import { markLocalStatusAsSynced, clearAllLocalDataForWorkOrder } from './localStatusService';
import { saveDadosRecord, saveComentarioEtapa } from './serviceStepsService';
import { supabase } from './supabase';

// Tipos para dados offline
export interface OfflineAction {
  id: string;
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL' | 'AUDITORIA_FINAL' | 'DADOS_RECORD' | 'COMENTARIO_ETAPA' | 'CHECKLIST_ETAPA';
  timestamp: string;
  workOrderId: number;
  technicoId: string;
  data: any;
  synced: boolean;
  attempts: number;
}

export interface OfflinePhotoAction extends OfflineAction {
  type: 'PHOTO_INICIO' | 'PHOTO_FINAL';
  data: {
    photoUri: string;
    photoId?: string; // ID da foto no armazenamento híbrido
    base64?: string;
    motivo?: string;
  };
}

// Variáveis globais para controle
let isSyncing = false;
let syncTimeout: NodeJS.Timeout | null = null;
let autoSyncInterval: NodeJS.Timeout | null = null;
let remainingActionsCount = 0; // Contador dinâmico para sincronização

// Callback para notificar a UI sobre mudanças de sincronização
let syncCallbacks: Array<(result: { total: number; synced: number; failed: number }) => void> = [];

// Callback para notificar quando uma OS é finalizada online
let osFinalizadaCallbacks: Array<(workOrderId: number) => void> = [];

// Constantes
const OFFLINE_ACTIONS_KEY = 'offline_actions';
const MAX_SYNC_ATTEMPTS = 3;
const SYNC_TIMEOUT = 30000; // 30 segundos timeout por ação

/**
 * Verifica se há conexão com a internet
 */
export const checkNetworkConnection = async (): Promise<boolean> => {
  try {
    const netInfo = await NetInfo.fetch();
    return netInfo.isConnected === true && netInfo.isInternetReachable === true;
  } catch (error) {
    console.log('⚠️ Erro ao verificar conexão:', error);
    return false;
  }
};

/**
 * Verifica se está sincronizando no momento
 */
export const isSyncInProgress = (): boolean => {
  return isSyncing;
};

/**
 * Obtém o número de ações restantes durante a sincronização
 */
export const getRemainingActionsCount = (): number => {
  return remainingActionsCount;
};

/**
 * Força parada da sincronização (em caso de travamento)
 */
export const forceStopSync = (): void => {
  console.log('🛑 Forçando parada da sincronização...');
  isSyncing = false;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
};

/**
 * Executa uma função com timeout
 */
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout na operação')), timeoutMs)
    )
  ]);
};

/**
 * Salva ação offline USANDO ASYNCSTORAGE DIRETO
 */
const saveOfflineAction = async (action: OfflineAction): Promise<void> => {
  try {
    const existingActions = await getOfflineActions();
    const updatedActions = [...existingActions, action];
    
    // Usar AsyncStorage direto para ações offline (SEM armazenamento híbrido)
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
    
    console.log('💾 Ação offline salva no AsyncStorage direto:', action.type);
  } catch (error) {
    console.error('❌ Erro ao salvar ação offline no AsyncStorage:', error);
    throw error;
  }
};

/**
 * Recupera todas as ações offline USANDO ASYNCSTORAGE DIRETO
 */
export const getOfflineActions = async (): Promise<OfflineAction[]> => {
  try {
    // Usar AsyncStorage direto (SEM armazenamento híbrido)
    const actionsJson = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
    
    if (!actionsJson) {
      return [];
    }

    const actions: OfflineAction[] = JSON.parse(actionsJson);
    return actions;
  } catch (error) {
    console.error('❌ Erro ao carregar ações offline do AsyncStorage:', error);
    return [];
  }
};

/**
 * Marca ação como sincronizada
 */
const markActionAsSynced = async (actionId: string): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const actionToSync = actions.find(action => action.id === actionId);
    if (!actionToSync) {
      console.error(`❌ Ação não encontrada para marcar como sincronizada: ${actionId}`);
      return;
    }
    
    const updatedActions = actions.map(action => 
      action.id === actionId ? { ...action, synced: true } : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
    console.log(`✅ Ação ${actionToSync.type} marcada como sincronizada`);
    
  } catch (error) {
    console.error('❌ Erro ao marcar ação como sincronizada:', error);
  }
};

/**
 * Remove ações já sincronizadas
 */
export const cleanSyncedActions = async (): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const syncedActions = actions.filter(action => action.synced);
    const unsyncedActions = actions.filter(action => !action.synced);
    
    if (syncedActions.length > 0) {
      console.log(`🧹 Removendo ${syncedActions.length} ações sincronizadas`);
      await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(unsyncedActions));
    }
    
  } catch (error) {
    console.error('❌ Erro ao limpar ações sincronizadas:', error);
  }
};

/**
 * Incrementa tentativas de sincronização
 */
const incrementSyncAttempts = async (actionId: string): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const updatedActions = actions.map(action => 
      action.id === actionId ? { ...action, attempts: action.attempts + 1 } : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
  } catch (error) {
    console.error('❌ Erro ao incrementar tentativas:', error);
  }
};

/**
 * Salva foto de início USANDO ASYNCSTORAGE DIRETO (SEM HYBRIDSTORAGE)
 */
export const savePhotoInicioOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `photo_inicio_${workOrderId}_${technicoId}_${Date.now()}`;
  
  try {
    console.log('💾 Salvando foto de início diretamente no AsyncStorage (apenas URI)...');
    
    // 1. NOVO: Salvar apenas URI (sem conversão base64 para evitar SQLite)
    // A conversão para base64 será feita apenas durante a sincronização
    
    // 2. Salvar ação offline DIRETO NO ASYNCSTORAGE
    const offlineAction: OfflinePhotoAction = {
      id: actionId,
      type: 'PHOTO_INICIO',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        photoUri: photoUri, // Salvar URI diretamente (sem conversão)
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 3. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Tentando salvar foto de início online...');
      try {
        // Durante upload online, fazer conversão apenas se necessário
        let photoValueForUpload = photoUri;
        
        // Se for URI, converter para base64 temporariamente para upload
        if (photoUri.startsWith('file://')) {
          try {
            const FileSystem = await import('expo-file-system');
            const fileInfo = await FileSystem.getInfoAsync(photoUri);
            
            if (fileInfo.exists) {
              const base64 = await FileSystem.readAsStringAsync(photoUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              photoValueForUpload = `data:image/jpeg;base64,${base64}`;
            }
          } catch (conversionError) {
            console.warn('⚠️ Erro na conversão para upload, mantendo offline:', conversionError);
            return { success: true, savedOffline: true, error: 'Foto salva offline' };
          }
        }
        
        const { data, error } = await savePhotoInicio(workOrderId, technicoId, photoValueForUpload);
        
        if (!error && data) {
          // Sucesso online - marcar como sincronizado
          await markActionAsSynced(actionId);
          await markLocalStatusAsSynced(workOrderId);
          console.log('✅ Foto de início salva online com sucesso');
          return { success: true };
        } else {
          console.warn('⚠️ Erro ao salvar online, mantendo offline:', error);
        }
      } catch (onlineError) {
        console.warn('⚠️ Erro ao tentar upload online:', onlineError);
      }
    }
    
    console.log('📱 Foto de início salva offline (URI) para sincronização posterior');
    return { success: true, savedOffline: true, error: 'Foto salva offline' };

  } catch (error) {
    console.error('❌ Erro ao salvar foto de início offline:', error);
    return { success: false, error: 'Erro inesperado ao salvar foto' };
  }
};

/**
 * Salva foto final USANDO ASYNCSTORAGE DIRETO (SEM HYBRIDSTORAGE)
 */
export const savePhotoFinalOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `photo_final_${workOrderId}_${technicoId}_${Date.now()}`;
  
  try {
    console.log('💾 Salvando foto final diretamente no AsyncStorage (apenas URI)...');
    
    // 1. NOVO: Salvar apenas URI (sem conversão base64 para evitar SQLite)
    // A conversão para base64 será feita apenas durante a sincronização

    // 2. Verificar conexão primeiro
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar foto final online...');
      
      try {
        // Durante upload online, fazer conversão apenas se necessário
        let photoValueForUpload = photoUri;
        
        // Se for URI, converter para base64 temporariamente para upload
        if (photoUri.startsWith('file://')) {
          try {
            const FileSystem = await import('expo-file-system');
            const fileInfo = await FileSystem.getInfoAsync(photoUri);
            
            if (fileInfo.exists) {
              const base64 = await FileSystem.readAsStringAsync(photoUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              photoValueForUpload = `data:image/jpeg;base64,${base64}`;
            }
          } catch (conversionError) {
            console.warn('⚠️ Erro na conversão para upload, salvando offline:', conversionError);
            // Continuar para salvar offline
          }
        }
        
        const { data: auditData, error: auditError } = await saveAuditoriaFinal(
          workOrderId,
          technicoId,
          photoValueForUpload,
          true, // trabalhoRealizado
          '', // motivo
          '' // comentario
        );
        
        if (!auditError && auditData) {
          console.log('✅ Foto final salva online com sucesso:', auditData.id);
          return { success: true, savedOffline: false };
        } else {
          console.warn('⚠️ Falha ao salvar online, salvando offline...', auditError);
        }
      } catch (onlineError) {
        console.warn('⚠️ Erro ao tentar salvar online, salvando offline...', onlineError);
      }
    }

    // 3. Salvar ação offline DIRETO NO ASYNCSTORAGE
    const offlineAction: OfflinePhotoAction = {
      id: actionId,
      type: 'PHOTO_FINAL',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        photoUri: photoUri, // Salvar URI diretamente (sem conversão)
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);
    console.log('📱 Foto final salva offline (URI) para sincronização posterior');

    return { success: true, savedOffline: true, error: 'Foto salva offline' };

  } catch (error) {
    console.error('❌ Erro ao salvar foto final offline:', error);
    return { success: false, error: 'Erro inesperado ao salvar foto' };
  }
};

/**
 * Sincroniza uma ação específica
 */
const syncAction = async (action: OfflineAction): Promise<boolean> => {
  try {
    console.log(`🔄 Sincronizando ação ${action.type}:`, action.id);
    
    switch (action.type) {
      case 'PHOTO_INICIO':
        try {
          // Converter URI para base64 apenas durante sincronização
          let photoValueToSync = action.data.photoUri;
          
          if (photoValueToSync && photoValueToSync.startsWith('file://')) {
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoValueToSync);
              
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(photoValueToSync, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                photoValueToSync = `data:image/jpeg;base64,${base64}`;
                console.log('📸 URI convertido para base64 durante sincronização (PHOTO_INICIO)');
              } else {
                console.error('❌ Arquivo de foto inicial não encontrado:', photoValueToSync);
                return false;
              }
            } catch (conversionError) {
              console.error('❌ Erro na conversão de foto inicial:', conversionError);
              return false;
            }
          }
          
          const photoPromise = savePhotoInicio(
            action.workOrderId,
            action.technicoId,
            photoValueToSync
          );
          
          const { data: photoData, error: photoError } = await withTimeout(photoPromise, SYNC_TIMEOUT);
          
          if (photoError) {
            console.error('❌ Erro ao sincronizar foto inicial:', photoError);
            return false;
          }
          
          console.log('✅ Foto inicial sincronizada:', photoData?.id);
          return true;
        } catch (photoSyncError) {
          console.error('💥 Erro inesperado ao sincronizar foto inicial:', photoSyncError);
          return false;
        }

      case 'PHOTO_FINAL':
        try {
          // Converter URI para base64 apenas durante sincronização
          let photoValueToSync = action.data.photoUri;
          
          if (photoValueToSync && photoValueToSync.startsWith('file://')) {
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoValueToSync);
              
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(photoValueToSync, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                photoValueToSync = `data:image/jpeg;base64,${base64}`;
                console.log('📸 URI convertido para base64 durante sincronização (PHOTO_FINAL)');
              } else {
                console.error('❌ Arquivo de foto final não encontrado:', photoValueToSync);
                return false;
              }
            } catch (conversionError) {
              console.error('❌ Erro na conversão de foto final:', conversionError);
              return false;
            }
          }
          
          // Para foto final, precisamos atualizar o registro existente de auditoria
          const { saveAuditoriaFinal } = await import('./auditService');
          
          const finalAuditPromise = saveAuditoriaFinal(
            action.workOrderId,
            action.technicoId,
            photoValueToSync,
            true, // trabalhoRealizado
            '', // motivo
            '' // comentario
          );
          
          const { data: auditData, error: auditError } = await withTimeout(finalAuditPromise, SYNC_TIMEOUT);
          
          if (auditError) {
            console.error('❌ Erro ao sincronizar foto final:', auditError);
            return false;
          }
          
          console.log('✅ Foto final sincronizada:', auditData?.id);
          return true;
        } catch (photoFinalSyncError) {
          console.error('💥 Erro inesperado ao sincronizar foto final:', photoFinalSyncError);
          return false;
        }

      case 'AUDITORIA_FINAL':
        try {
          // Converter URI para base64 apenas durante sincronização  
          let photoValueToSync = action.data.photoUri;
          
          if (photoValueToSync && photoValueToSync.startsWith('file://')) {
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoValueToSync);
              
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(photoValueToSync, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                photoValueToSync = `data:image/jpeg;base64,${base64}`;
                console.log('📸 URI convertido para base64 durante sincronização (AUDITORIA_FINAL)');
              } else {
                console.error('❌ Arquivo de auditoria final não encontrado:', photoValueToSync);
                return false;
              }
            } catch (conversionError) {
              console.error('❌ Erro na conversão de auditoria final:', conversionError);
              return false;
            }
          }
          
          const auditPromise = saveAuditoriaFinal(
            action.workOrderId,
            action.technicoId,
            photoValueToSync,
            action.data.trabalhoRealizado,
            action.data.motivo,
            action.data.comentario
          );
          
          const { data: auditData, error: auditError } = await withTimeout(auditPromise, SYNC_TIMEOUT);
          
          if (auditError) {
            console.error('❌ Erro ao sincronizar auditoria final:', auditError);
            return false;
          }
          
          console.log('✅ Auditoria final sincronizada:', auditData?.id);
          return true;
        } catch (auditSyncError) {
          console.error('💥 Erro inesperado ao sincronizar auditoria final:', auditSyncError);
          return false;
        }

      case 'DADOS_RECORD':
        try {
          // Verificar se é foto extra (entrada_dados_id = null) ou foto normal
          const isExtraPhoto = action.data.entradaDadosId === null;
          
          if (isExtraPhoto) {
            console.log('📸 Sincronizando foto extra via ação offline...');
          } else {
            console.log('📸 Sincronizando dados normais da coleta...');
          }
          
          // Converter URI para base64 apenas durante sincronização
          let photoValueToSync = action.data.photoUri;
          
          if (photoValueToSync && photoValueToSync.startsWith('file://')) {
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoValueToSync);
              
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(photoValueToSync, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                photoValueToSync = `data:image/jpeg;base64,${base64}`;
                console.log(`📸 URI convertido para base64 durante sincronização (${isExtraPhoto ? 'FOTO_EXTRA' : 'DADOS_RECORD'})`);
              } else {
                console.error('❌ Arquivo de dados não encontrado:', photoValueToSync);
                return false;
              }
            } catch (conversionError) {
              console.error('❌ Erro na conversão de dados:', conversionError);
              return false;
            }
          }
          
          const dadosPromise = saveDadosRecord(
            action.workOrderId,
            action.data.entradaDadosId, // Pode ser null para fotos extras ou ID normal
            photoValueToSync
          );
          
          const { data: dadosData, error: dadosError } = await withTimeout(dadosPromise, SYNC_TIMEOUT);
          
          if (dadosError) {
            if (isExtraPhoto) {
              console.error('❌ Erro ao sincronizar foto extra da coleta:', dadosError);
            } else {
            console.error('❌ Erro ao sincronizar dados da coleta:', dadosError);
            }
            return false;
          }
          
          if (isExtraPhoto) {
            console.log('✅ Foto extra da coleta sincronizada:', dadosData?.id);
          } else {
          console.log('✅ Dados da coleta sincronizados:', dadosData?.id);
          }
          return true;
        } catch (dadosSyncError) {
          const isExtraPhoto = action.data.entradaDadosId === null;
          if (isExtraPhoto) {
            console.error('💥 Erro inesperado ao sincronizar foto extra da coleta:', dadosSyncError);
          } else {
          console.error('💥 Erro inesperado ao sincronizar dados da coleta:', dadosSyncError);
          }
          return false;
        }

      case 'COMENTARIO_ETAPA':
        try {
          const comentarioPromise = saveComentarioEtapa(
            action.workOrderId,
            action.data.etapaId,
            action.data.comentario
          );
          
          const { data: comentarioData, error: comentarioError } = await withTimeout(comentarioPromise, SYNC_TIMEOUT);
          
          if (comentarioError) {
            console.error('❌ Erro ao sincronizar comentário da etapa:', comentarioError);
            return false;
          }
          
          console.log('✅ Comentário da etapa sincronizado:', comentarioData?.id);
          return true;
        } catch (comentarioSyncError) {
          console.error('💥 Erro inesperado ao sincronizar comentário da etapa:', comentarioSyncError);
          return false;
        }

      case 'CHECKLIST_ETAPA':
        try {
          // Por enquanto, apenas marcar como sincronizado
          // TODO: Implementar lógica específica para salvar checklist no servidor
          console.log('📋 Sincronização de checklist ainda não implementada completamente - marcando como sincronizado');
          return true;
        } catch (checklistSyncError) {
          console.error('💥 Erro inesperado ao sincronizar checklist:', checklistSyncError);
          return false;
        }

      default:
        console.log('⚠️ Tipo de ação não implementado:', action.type);
        return false;
    }
  } catch (error) {
    console.error('💥 Erro ao sincronizar ação:', error);
    return false;
  }
};

/**
 * Sincroniza status locais das OS que foram alterados offline
 */
const syncLocalWorkOrderStatuses = async (): Promise<{ synced: number; failed: number }> => {
  try {
    const { getLocalWorkOrderStatuses } = await import('./localStatusService');
    const { updateWorkOrderStatus } = await import('./workOrderService');
    const { markLocalStatusAsSynced } = await import('./localStatusService');
    
    const localStatuses = await getLocalWorkOrderStatuses();
    
    let synced = 0;
    let failed = 0;
    
    // Buscar apenas status não sincronizados
    const unsyncedStatuses = Object.entries(localStatuses).filter(
      ([_, statusData]) => !statusData.synced
    );
    
    if (unsyncedStatuses.length === 0) {
      console.log('✅ Nenhum status local para sincronizar');
      return { synced: 0, failed: 0 };
    }
    
    console.log(`🔄 Sincronizando ${unsyncedStatuses.length} status locais...`);
    
    for (const [workOrderId, statusData] of unsyncedStatuses) {
      try {
        console.log(`🔄 Sincronizando status da OS ${workOrderId}: ${statusData.status}`);
        
        // Mapear status local para status da aplicação
        let appStatus: 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada';
        switch (statusData.status) {
          case 'aguardando':
            appStatus = 'aguardando';
            break;
          case 'em_progresso':
            appStatus = 'em_progresso';
            break;
          case 'finalizada':
            appStatus = 'finalizada';
            break;
          case 'cancelada':
            appStatus = 'cancelada';
            break;
          default:
            console.warn(`⚠️ Status local desconhecido: ${statusData.status}`);
            continue;
        }
        
        // Tentar atualizar no servidor
        const { error } = await updateWorkOrderStatus(workOrderId, appStatus);
        
        if (error) {
          console.error(`❌ Erro ao sincronizar status da OS ${workOrderId}:`, error);
          failed++;
        } else {
          console.log(`✅ Status da OS ${workOrderId} sincronizado: ${appStatus}`);
          
          // Marcar como sincronizado (remove do AsyncStorage)
          await markLocalStatusAsSynced(parseInt(workOrderId));
          synced++;
          
          // Se foi finalizada, limpar TODOS os dados locais e notificar callbacks
          if (appStatus === 'finalizada') {
            console.log(`🧹 OS ${workOrderId} finalizada via sincronização - limpando dados locais`);
            
            // Limpar todos os dados locais da OS finalizada
            const { clearAllLocalDataForWorkOrder } = await import('./localStatusService');
            await clearAllLocalDataForWorkOrder(parseInt(workOrderId));
            
            // Limpar ações offline específicas desta OS
            await clearOfflineActionsForWorkOrder(parseInt(workOrderId));
            
            // Notificar callbacks
            notifyOSFinalizadaCallbacks(parseInt(workOrderId));
            
            console.log(`✅ Dados locais da OS ${workOrderId} limpos após sincronização de status`);
          }
        }
        
      } catch (error) {
        console.error(`💥 Erro ao processar status da OS ${workOrderId}:`, error);
        failed++;
      }
    }
    
    console.log(`✅ Sincronização de status locais: ${synced} sucesso, ${failed} falhas`);
    return { synced, failed };
    
  } catch (error) {
    console.error('💥 Erro na sincronização de status locais:', error);
    return { synced: 0, failed: 0 };
  }
};

/**
 * Sincroniza fotos de dados coletados que estão em offline_dados_records
 * mas ainda não foram sincronizadas com a tabela dados do Supabase
 */
export const syncOfflineDadosRecords = async (): Promise<{
  success: boolean;
  synced: number;
  errors: string[];
}> => {
  const errors: string[] = [];
  let syncedCount = 0;

  try {
    console.log('📸 Verificando fotos de dados coletados offline...');

    const offlineData = await AsyncStorage.getItem('offline_dados_records');
    if (!offlineData) {
      return { success: true, synced: 0, errors: [] };
    }

    const records = JSON.parse(offlineData);
    const recordsToSync = Object.entries(records).filter(([_, record]: [string, any]) => !record.synced);

    if (recordsToSync.length === 0) {
      return { success: true, synced: 0, errors: [] };
    }

    console.log(`📸 ${recordsToSync.length} fotos de dados encontradas para sincronizar`);

    // Verificar se está online
    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
      console.log('📱 Sem conexão - pulando sincronização de dados coletados');
      return { success: true, synced: 0, errors: [] };
    }

    // Sincronizar cada registro
    for (const [recordKey, record] of recordsToSync) {
      try {
        const recordData = record as any;
        
        console.log(`🔄 Sincronizando foto de dados: ${recordKey}`);
        
        // Verificar se o valor já está em base64 ou é um URI
        let photoValueToSync = recordData.valor;
        
        if (photoValueToSync && typeof photoValueToSync === 'string') {
          // Se já é base64, usar diretamente
          if (photoValueToSync.startsWith('data:image/')) {
            console.log('📸 Foto já está em base64, usando diretamente');
          } 
          // Se é um URI de arquivo, tentar converter para base64
          else if (photoValueToSync.startsWith('file://')) {
            console.log('📸 Tentando converter URI para base64...');
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoValueToSync);
              
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(photoValueToSync, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                photoValueToSync = `data:image/jpeg;base64,${base64}`;
                console.log('✅ Conversão URI -> base64 bem-sucedida');
              } else {
                // Arquivo não existe mais - remover registro órfão
                console.warn(`⚠️ Arquivo não encontrado, removendo registro órfão: ${recordKey}`);
                delete records[recordKey];
                continue;
              }
            } catch (conversionError) {
              console.error(`❌ Erro ao converter URI para base64 (${recordKey}):`, conversionError);
              // Remover registro órfão que não pode ser convertido
              delete records[recordKey];
              errors.push(`Registro órfão removido: ${recordKey}`);
              continue;
            }
          } 
          // Formato desconhecido
          else {
            console.warn(`⚠️ Formato de foto desconhecido em ${recordKey}, removendo`);
            delete records[recordKey];
            errors.push(`Formato inválido removido: ${recordKey}`);
            continue;
          }
        } else {
          console.warn(`⚠️ Valor de foto inválido em ${recordKey}, removendo`);
          delete records[recordKey];
          errors.push(`Valor inválido removido: ${recordKey}`);
          continue;
        }
        
        // Sincronizar com o Supabase usando o valor em base64
        const { data, error } = await saveDadosRecord(
          recordData.ordem_servico_id,
          recordData.entrada_dados_id,
          photoValueToSync
        );
        
        if (!error && data) {
          // Sucesso - marcar como sincronizado
          records[recordKey].synced = true;
          records[recordKey].synced_at = new Date().toISOString();
          records[recordKey].supabase_id = data.id;
          syncedCount++;
          
          console.log(`✅ Foto de dados sincronizada: ${recordKey} -> Supabase ID: ${data.id}`);
        } else {
          errors.push(`Erro ao sincronizar ${recordKey}: ${error}`);
          console.error(`❌ Erro ao sincronizar foto de dados ${recordKey}:`, error);
        }
      } catch (syncError) {
        errors.push(`Erro inesperado ao sincronizar ${recordKey}: ${syncError}`);
        console.error(`💥 Erro inesperado ao sincronizar ${recordKey}:`, syncError);
      }
    }

    // Salvar estado atualizado (incluindo remoção de registros órfãos)
    await AsyncStorage.setItem('offline_dados_records', JSON.stringify(records));

    console.log(`✅ ${syncedCount} fotos de dados sincronizadas com Supabase`);
    
    return { success: true, synced: syncedCount, errors };

  } catch (error) {
    console.error('💥 Erro ao sincronizar fotos de dados offline:', error);
    return { success: false, synced: syncedCount, errors: [error instanceof Error ? error.message : String(error)] };
  }
};

/**
 * Sincroniza todas as ações pendentes
 */
export const syncAllPendingActions = async (): Promise<{ 
  total: number; 
  synced: number; 
  errors: string[] 
}> => {
  // Verificar se já está sincronizando
  if (isSyncing) {
    console.log('⏳ Sincronização já em andamento, pulando...');
    return { total: 0, synced: 0, errors: [] };
  }

  console.log('🔄 Iniciando sincronização de ações pendentes...');

  const isOnline = await checkNetworkConnection();
  if (!isOnline) {
    console.log('📱 Sem conexão, pulando sincronização');
    return { total: 0, synced: 0, errors: [] };
  }

  // Definir lock
  isSyncing = true;

  try {
    // Sincronizar ações offline principais
    const actions = await getOfflineActions();
    const pendingActions = actions.filter(action => 
      !action.synced && action.attempts < MAX_SYNC_ATTEMPTS
    );

    let synced = 0;
    const errors: string[] = [];

    // Sincronizar ações pendentes
    for (const action of pendingActions) {
      try {
        const success = await syncAction(action);
        if (success) {
          await markActionAsSynced(action.id);
          synced++;
        } else {
          await incrementSyncAttempts(action.id);
          errors.push(`Falha ao sincronizar ação ${action.id}`);
        }
      } catch (actionError) {
        await incrementSyncAttempts(action.id);
        errors.push(`Erro ao sincronizar ação ${action.id}: ${actionError instanceof Error ? actionError.message : String(actionError)}`);
      }
    }

    // NOVO: Sincronizar fotos de dados coletados offline
    try {
      const { synced: dadosSynced, errors: dadosErrors } = await syncOfflineDadosRecords();
      synced += dadosSynced;
      errors.push(...dadosErrors);
    } catch (dadosError) {
      errors.push(`Erro ao sincronizar dados coletados: ${dadosError instanceof Error ? dadosError.message : String(dadosError)}`);
    }

    // NOVA FUNCIONALIDADE: Sincronizar fotos extras
    try {
      const { synced: extrasSynced, errors: extrasErrors } = await syncFotosExtrasOffline();
      synced += extrasSynced;
      errors.push(...extrasErrors);
    } catch (extrasError) {
      errors.push(`Erro ao sincronizar fotos extras: ${extrasError instanceof Error ? extrasError.message : String(extrasError)}`);
    }

    console.log(`🔄 Sincronização concluída: ${synced} itens sincronizados`);
    
    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} erros durante sincronização:`, errors.slice(0, 3));
    }

    return { total: pendingActions.length, synced, errors };
  } catch (error) {
    console.error('💥 Erro na sincronização:', error);
    return { total: 0, synced: 0, errors: [error instanceof Error ? error.message : String(error)] };
  } finally {
    // Remover lock
    isSyncing = false;
  }
};

/**
 * Sincronização com debounce para evitar chamadas múltiplas
 */
const debouncedSync = () => {
  // Cancelar timeout anterior se existir
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Agendar nova sincronização
  syncTimeout = setTimeout(() => {
    syncAllPendingActions();
    syncTimeout = null;
  }, 3000); // 3 segundos de debounce
};

/**
 * Monitora conexão e sincroniza automaticamente
 */
export const startAutoSync = (): (() => void) => {
  console.log('🔄 Iniciando monitoramento automático de sincronização');

  const unsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('🌐 Conexão restaurada, agendando sincronização automática...');
      debouncedSync();
    }
  });

  return unsubscribe;
};

/**
 * Salva auditoria final offline se não houver conexão
 */
export const saveAuditoriaFinalOffline = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string,
  trabalhoRealizado: boolean,
  motivo?: string,
  comentario?: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  try {
    // Verificar conexão
    const netInfo = await NetInfo.fetch();
    
    if (netInfo.isConnected) {
      // Online: tentar salvar diretamente
      console.log('🌐 Tentando salvar auditoria final online...');
      const { data, error } = await saveAuditoriaFinal(
        workOrderId, 
        technicoId, 
        photoUri, 
        trabalhoRealizado,
        motivo,
        comentario
      );
      
      if (error) {
        // Se falhar online, salvar offline como fallback
        console.log('⚠️ Falha ao salvar online, salvando offline como fallback');
        await saveAuditoriaFinalToQueue(workOrderId, technicoId, photoUri, trabalhoRealizado, motivo, comentario);
        return { success: true, savedOffline: true };
      }
      
      // ✅ Sucesso online: limpar TODOS os dados locais e ações offline
      console.log('✅ Auditoria salva online com sucesso - limpando dados locais');
      
      // Limpar dados locais (status, etapas, fotos, etc.)
      const { clearAllLocalDataForWorkOrder } = await import('./localStatusService');
      await clearAllLocalDataForWorkOrder(workOrderId);
      
      // Limpar especificamente ações offline desta OS para evitar "1 pendente"
      await clearOfflineActionsForWorkOrder(workOrderId);
      
      // Notificar callbacks de OS finalizada para atualizar a UI
      notifyOSFinalizadaCallbacks(workOrderId);
      
      console.log('🧹 Dados locais e ações offline limpas - ícone de sincronização removido');
      
      return { success: true, savedOffline: false };
    } else {
      // Offline: salvar na fila
      console.log('📱 Offline - salvando auditoria na fila para sincronização');
      await saveAuditoriaFinalToQueue(workOrderId, technicoId, photoUri, trabalhoRealizado, motivo, comentario);
      return { success: true, savedOffline: true };
    }
  } catch (error) {
    console.error('💥 Erro ao salvar auditoria final:', error);
    return { success: false, error: 'Erro inesperado ao salvar auditoria final' };
  }
};

/**
 * Salva auditoria final na fila offline
 */
const saveAuditoriaFinalToQueue = async (
  workOrderId: number,
  technicoId: string,
  photoUri: string,
  trabalhoRealizado: boolean,
  motivo?: string,
  comentario?: string
) => {
  const action: OfflineAction = {
    id: `auditoria_final_${workOrderId}_${Date.now()}`,
    type: 'AUDITORIA_FINAL',
    timestamp: new Date().toISOString(),
    workOrderId,
    technicoId,
    data: {
      photoUri,
      trabalhoRealizado,
      motivo,
      comentario,
    },
    synced: false,
    attempts: 0,
  };

  await saveOfflineAction(action);
};

/**
 * Obtém estatísticas das ações offline agrupadas por OS
 */
export const getSyncStats = async (): Promise<{
  total: number;
  pending: number;
  synced: number;
  failed: number;
}> => {
  try {
    const actions = await getOfflineActions();
    
    // Agrupar ações por workOrderId para contar apenas 1 por OS
    const actionsByWorkOrder = actions.reduce((acc, action) => {
      const key = action.workOrderId.toString();
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(action);
      return acc;
    }, {} as { [workOrderId: string]: OfflineAction[] });
    
    let pending = 0;
    let synced = 0;
    let failed = 0;
    
    // Para cada OS, verificar o status geral das suas ações
    Object.values(actionsByWorkOrder).forEach(osActions => {
      const hasPending = osActions.some(a => !a.synced && a.attempts < MAX_SYNC_ATTEMPTS);
      const allSynced = osActions.every(a => a.synced);
      const hasFailed = osActions.some(a => !a.synced && a.attempts >= MAX_SYNC_ATTEMPTS);
      
      if (hasPending) {
        pending++;
      } else if (allSynced) {
        synced++;
      } else if (hasFailed) {
        failed++;
      }
    });
    
    const totalOSs = Object.keys(actionsByWorkOrder).length;
    
    return {
      total: totalOSs,
      pending,
      synced,
      failed
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    return { total: 0, pending: 0, synced: 0, failed: 0 };
  }
};

/**
 * Remove ações que falharam definitivamente
 */
export const clearFailedActions = async (): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const validActions = actions.filter(action => 
      action.synced || action.attempts < MAX_SYNC_ATTEMPTS
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(validActions));
    console.log('🧹 Ações que falharam foram removidas');
  } catch (error) {
    console.error('❌ Erro ao limpar ações que falharam:', error);
  }
};

/**
 * Reseta tentativas de ações que falharam para tentar novamente
 */
export const retryFailedActions = async (): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    const updatedActions = actions.map(action => 
      action.attempts >= MAX_SYNC_ATTEMPTS 
        ? { ...action, attempts: 0 } // Reset tentativas
        : action
    );
    
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(updatedActions));
    console.log('🔄 Tentativas de ações que falharam foram resetadas');
  } catch (error) {
    console.error('❌ Erro ao resetar tentativas:', error);
  }
};

/**
 * Limpa todas as ações offline (usar com cuidado)
 */
export const clearAllOfflineActions = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(OFFLINE_ACTIONS_KEY);
    console.log('🧹 Todas as ações offline foram removidas');
  } catch (error) {
    console.error('❌ Erro ao limpar todas as ações:', error);
  }
};

/**
 * Remove ações offline específicas de uma OS finalizada online
 */
export const clearOfflineActionsForWorkOrder = async (workOrderId: number): Promise<void> => {
  try {
    const actions = await getOfflineActions();
    
    // Filtrar ações que NÃO são da OS finalizada
    const remainingActions = actions.filter(action => action.workOrderId !== workOrderId);
    
    // Salvar apenas as ações restantes
    await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(remainingActions));
    
    const removedCount = actions.length - remainingActions.length;
    if (removedCount > 0) {
      console.log(`🧹 Removidas ${removedCount} ações offline da OS ${workOrderId}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao limpar ações offline da OS ${workOrderId}:`, error);
  }
};

/**
 * Registra um callback para ser chamado quando uma OS é finalizada online
 */
export const registerOSFinalizadaCallback = (callback: (workOrderId: number) => void): () => void => {
  osFinalizadaCallbacks.push(callback);
  
  // Retorna função para remover o callback
  return () => {
    osFinalizadaCallbacks = osFinalizadaCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Notifica todos os callbacks registrados sobre uma OS finalizada online
 */
export const notifyOSFinalizadaCallbacks = (workOrderId: number) => {
  console.log(`🔔 Notificando callbacks sobre OS ${workOrderId} finalizada online...`);
  osFinalizadaCallbacks.forEach(callback => {
    try {
      callback(workOrderId);
    } catch (error) {
      console.error('❌ Erro ao executar callback de OS finalizada:', error);
    }
  });
};

/**
 * Registra um callback para ser chamado quando a sincronização automática terminar
 */
export const registerSyncCallback = (callback: (result: { total: number; synced: number; failed: number }) => void): () => void => {
  syncCallbacks.push(callback);
  
  // Retorna função para remover o callback
  return () => {
    syncCallbacks = syncCallbacks.filter(cb => cb !== callback);
  };
};

/**
 * Notifica todos os callbacks registrados sobre o resultado da sincronização
 */
const notifySyncCallbacks = (result: { total: number; synced: number; failed: number }) => {
  syncCallbacks.forEach(callback => {
    try {
      callback(result);
    } catch (error) {
      console.error('❌ Erro ao executar callback de sincronização:', error);
    }
  });
};

/**
 * Salva dados da coleta (fotos) USANDO ASYNCSTORAGE DIRETO (SEM HYBRIDSTORAGE)
 */
export const saveDadosRecordOffline = async (
  workOrderId: number,
  technicoId: string,
  entradaDadosId: number,
  photoUri: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `dados_record_${workOrderId}_${entradaDadosId}_${Date.now()}`;
  
  try {
    console.log('💾 Salvando dados da coleta diretamente no AsyncStorage (apenas URI)...');
    
    // 1. NOVO: Salvar apenas URI (sem conversão base64 para evitar SQLite)
    // A conversão para base64 será feita apenas durante a sincronização

    // 2. Salvar ação offline DIRETO NO ASYNCSTORAGE
    const offlineAction: OfflineAction = {
      id: actionId,
      type: 'DADOS_RECORD',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        entradaDadosId,
        photoUri: photoUri, // Salvar URI diretamente (sem conversão)
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 3. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar dados da coleta online...');
      
      try {
        // Durante upload online, fazer conversão apenas se necessário
        let photoValueForUpload = photoUri;
        
        // Se for URI, converter para base64 temporariamente para upload
        if (photoUri.startsWith('file://')) {
          try {
            const FileSystem = await import('expo-file-system');
            const fileInfo = await FileSystem.getInfoAsync(photoUri);
            
            if (fileInfo.exists) {
              const base64 = await FileSystem.readAsStringAsync(photoUri, {
                encoding: FileSystem.EncodingType.Base64,
              });
              photoValueForUpload = `data:image/jpeg;base64,${base64}`;
            }
          } catch (conversionError) {
            console.warn('⚠️ Erro na conversão para upload, mantendo offline:', conversionError);
            return { success: true, savedOffline: true, error: 'Dados salvos offline' };
          }
        }
        
        const { data, error } = await saveDadosRecord(workOrderId, entradaDadosId, photoValueForUpload);
        
        if (!error && data) {
          // Sucesso online - marcar como sincronizado
          await markActionAsSynced(actionId);
          console.log('✅ Dados da coleta salvos online com sucesso');
          return { success: true };
        } else {
          console.warn('⚠️ Erro ao salvar online, mantendo offline:', error);
        }
      } catch (onlineError) {
        console.warn('⚠️ Erro ao tentar upload online:', onlineError);
      }
    }
    
    console.log('📱 Dados da coleta salvos offline (URI) para sincronização posterior');
    return { success: true, savedOffline: true, error: 'Dados salvos offline' };

  } catch (error) {
    console.error('❌ Erro ao salvar dados da coleta offline:', error);
    return { success: false, error: 'Erro inesperado ao salvar dados da coleta' };
  }
};

/**
 * Salva comentário da etapa com suporte offline
 */
export const saveComentarioEtapaOffline = async (
  workOrderId: number,
  technicoId: string,
  etapaId: number,
  comentario: string
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `comentario_etapa_${workOrderId}_${etapaId}_${Date.now()}`;
  
  try {
    // 1. Sempre salvar offline primeiro
    const offlineAction: OfflineAction = {
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

    await saveOfflineAction(offlineAction);

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar comentário online...');
      
      const { data, error } = await saveComentarioEtapa(workOrderId, etapaId, comentario);
      
      if (!error && data) {
        // Sucesso online - marcar como sincronizado  
        await markActionAsSynced(actionId);
        return { success: true };
      } else {
        // Falha online - manter offline para sincronização posterior
        return { success: true, savedOffline: true, error: `Salvo offline: ${error}` };
      }
    } else {
      return { success: true, savedOffline: true, error: 'Sem conexão - salvo offline' };
    }

  } catch (error) {
    return { success: false, error: 'Erro inesperado ao salvar comentário' };
  }
};

/**
 * Cria arquivo temporário a partir de base64 para upload
 */
const createTempFileFromBase64 = async (base64: string): Promise<string | null> => {
  try {
    // Extrair dados base64
    const base64Data = base64.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Verificar se o FileSystem tem as propriedades necessárias
    if (!FileSystem.cacheDirectory) {
      console.error('❌ FileSystem.cacheDirectory não disponível');
      return null;
    }
    
    const tempUri = `${FileSystem.cacheDirectory}temp_upload_${Date.now()}.jpg`;
    
    // Salvar como arquivo temporário
    await FileSystem.writeAsStringAsync(tempUri, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    return tempUri;
  } catch (error) {
    console.error('❌ Erro ao criar arquivo temporário:', error);
    return null;
  }
};

/**
 * Salva checklist de etapa com suporte offline
 */
export const saveChecklistEtapaOffline = async (
  workOrderId: number,
  technicoId: string,
  checklistData: { [entryId: number]: boolean }
): Promise<{ success: boolean; error?: string; savedOffline?: boolean }> => {
  const actionId = `checklist_etapa_${workOrderId}_${Date.now()}`;
  
  try {
    // 1. Sempre salvar offline primeiro
    const offlineAction: OfflineAction = {
      id: actionId,
      type: 'CHECKLIST_ETAPA',
      timestamp: new Date().toISOString(),
      workOrderId,
      technicoId,
      data: {
        checklistData,
      },
      synced: false,
      attempts: 0
    };

    await saveOfflineAction(offlineAction);

    // 2. Verificar conexão e tentar salvar online
    const isOnline = await checkNetworkConnection();
    
    if (isOnline) {
      console.log('🌐 Conexão disponível, tentando salvar checklist online...');
      
      // Por enquanto, apenas salvar offline - implementar sincronização quando necessário
      return { success: true, savedOffline: true, error: 'Checklist salvo offline para sincronização' };
    } else {
      return { success: true, savedOffline: true, error: 'Sem conexão - checklist salvo offline' };
    }

  } catch (error) {
    return { success: false, error: 'Erro inesperado ao salvar checklist' };
  }
}; 

/**
 * Sincroniza fotos extras offline
 * NOVO: Agora sincroniza fotos extras com o servidor usando entrada_dados_id = null
 */
export const syncFotosExtrasOffline = async (): Promise<{
  success: boolean;
  synced: number;
  errors: string[];
}> => {
  const errors: string[] = [];
  let syncedCount = 0;

  try {
    console.log('📸 Verificando fotos extras offline para sincronização...');

    const offlineExtrasData = await AsyncStorage.getItem('offline_fotos_extras');
    if (!offlineExtrasData) {
      return { success: true, synced: 0, errors: [] };
    }

    const extrasRecords = JSON.parse(offlineExtrasData);
    const recordsToSync = Object.entries(extrasRecords).filter(([_, record]: [string, any]) => !record.synced);

    if (recordsToSync.length === 0) {
      return { success: true, synced: 0, errors: [] };
    }

    console.log(`📸 ${recordsToSync.length} fotos extras encontradas para sincronização`);

    // Verificar se está online
    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
      console.log('📱 Sem conexão - pulando sincronização de fotos extras');
      return { success: true, synced: 0, errors: [] };
    }

    // NOVO: Sincronizar cada foto extra com o servidor
    for (const [recordKey, record] of recordsToSync) {
      try {
        const recordData = record as any;
        
        console.log(`🔄 Sincronizando foto extra: ${recordKey}`);
        
        // Verificar se o valor já está em base64 ou é um URI
        let photoValueToSync = recordData.valor;
        
        if (photoValueToSync && typeof photoValueToSync === 'string') {
          // Se já é base64, usar diretamente
          if (photoValueToSync.startsWith('data:image/')) {
            console.log('📸 Foto extra já está em base64, usando diretamente');
          } 
          // Se é um URI de arquivo, tentar converter para base64
          else if (photoValueToSync.startsWith('file://')) {
            console.log('📸 Tentando converter URI de foto extra para base64...');
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoValueToSync);
              
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(photoValueToSync, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                photoValueToSync = `data:image/jpeg;base64,${base64}`;
                console.log('✅ Conversão URI -> base64 bem-sucedida para foto extra');
              } else {
                // Arquivo não existe mais - remover registro órfão
                console.warn(`⚠️ Arquivo de foto extra não encontrado, removendo registro órfão: ${recordKey}`);
                delete extrasRecords[recordKey];
                continue;
              }
            } catch (conversionError) {
              console.error(`❌ Erro ao converter URI de foto extra para base64 (${recordKey}):`, conversionError);
              // Remover registro órfão que não pode ser convertido
              delete extrasRecords[recordKey];
              errors.push(`Registro de foto extra órfão removido: ${recordKey}`);
              continue;
            }
          } 
          // Formato desconhecido
          else {
            console.warn(`⚠️ Formato de foto extra desconhecido em ${recordKey}, removendo`);
            delete extrasRecords[recordKey];
            errors.push(`Formato de foto extra inválido removido: ${recordKey}`);
            continue;
          }
        } else {
          console.warn(`⚠️ Valor de foto extra inválido em ${recordKey}, removendo`);
          delete extrasRecords[recordKey];
          errors.push(`Valor de foto extra inválido removido: ${recordKey}`);
          continue;
        }
        
        // NOVO: Sincronizar com o Supabase usando entrada_dados_id = null para fotos extras
        const { data, error } = await saveDadosRecord(
          recordData.ordem_servico_id,
          null, // entrada_dados_id especial para fotos extras
          photoValueToSync
        );
        
        if (!error && data) {
          // Sucesso - marcar como sincronizado
          extrasRecords[recordKey].synced = true;
          extrasRecords[recordKey].synced_at = new Date().toISOString();
          extrasRecords[recordKey].supabase_id = data.id;
          syncedCount++;
          
          console.log(`✅ Foto extra sincronizada: ${recordKey} -> Supabase ID: ${data.id}`);
        } else {
          errors.push(`Erro ao sincronizar foto extra ${recordKey}: ${error}`);
          console.error(`❌ Erro ao sincronizar foto extra ${recordKey}:`, error);
        }
      } catch (syncError) {
        errors.push(`Erro inesperado ao sincronizar foto extra ${recordKey}: ${syncError}`);
        console.error(`💥 Erro inesperado ao sincronizar foto extra ${recordKey}:`, syncError);
      }
    }

    // Salvar estado atualizado (incluindo remoção de registros órfãos)
    await AsyncStorage.setItem('offline_fotos_extras', JSON.stringify(extrasRecords));

    console.log(`✅ ${syncedCount} fotos extras sincronizadas com Supabase`);
    return { success: true, synced: syncedCount, errors };
  } catch (error) {
    console.error('❌ Erro ao sincronizar fotos extras offline:', error);
    return { success: false, synced: syncedCount, errors: [...errors, error instanceof Error ? error.message : String(error)] };
  }
}; 

/**
 * Limpa dados órfãos ao inicializar o app
 * Remove registros offline que apontam para arquivos que não existem mais
 */
export const cleanOrphanedOfflineData = async (): Promise<{
  success: boolean;
  cleaned: {
    dados_records: number;
    fotos_extras: number;
    actions: number;
  };
  errors: string[];
}> => {
  const errors: string[] = [];
  const cleaned = {
    dados_records: 0,
    fotos_extras: 0,
    actions: 0
  };

  try {
    console.log('🧹 Iniciando limpeza de dados órfãos...');

    // 1. Limpar offline_dados_records órfãos
    try {
      const offlineDataStr = await AsyncStorage.getItem('offline_dados_records');
      if (offlineDataStr) {
        const records = JSON.parse(offlineDataStr);
        const validRecords: any = {};
        
        for (const [recordKey, record] of Object.entries(records)) {
          const recordData = record as any;
          
          if (recordData.valor && typeof recordData.valor === 'string') {
            // Se já é base64, manter
            if (recordData.valor.startsWith('data:image/')) {
              validRecords[recordKey] = record;
            }
            // Se é URI, verificar se arquivo existe
            else if (recordData.valor.startsWith('file://')) {
              try {
                const FileSystem = await import('expo-file-system');
                const fileInfo = await FileSystem.getInfoAsync(recordData.valor);
                
                if (fileInfo.exists) {
                  validRecords[recordKey] = record;
                } else {
                  cleaned.dados_records++;
                  console.log(`🗑️ Removido registro órfão: ${recordKey}`);
                }
              } catch (checkError) {
                cleaned.dados_records++;
                console.log(`🗑️ Removido registro com erro: ${recordKey}`);
              }
            }
            // Formato desconhecido, remover
            else {
              cleaned.dados_records++;
              console.log(`🗑️ Removido registro formato inválido: ${recordKey}`);
            }
          } else {
            cleaned.dados_records++;
            console.log(`🗑️ Removido registro valor inválido: ${recordKey}`);
          }
        }
        
        if (cleaned.dados_records > 0) {
          await AsyncStorage.setItem('offline_dados_records', JSON.stringify(validRecords));
          console.log(`✅ ${cleaned.dados_records} registros órfãos removidos de offline_dados_records`);
        }
      }
    } catch (error) {
      errors.push(`Erro ao limpar offline_dados_records: ${error}`);
    }

    // 2. Limpar offline_fotos_extras órfãs
    try {
      const offlineExtrasStr = await AsyncStorage.getItem('offline_fotos_extras');
      if (offlineExtrasStr) {
        const extrasRecords = JSON.parse(offlineExtrasStr);
        const validExtras: any = {};
        
        for (const [recordKey, record] of Object.entries(extrasRecords)) {
          const recordData = record as any;
          
          if (recordData.valor && typeof recordData.valor === 'string') {
            // Se já é base64, manter
            if (recordData.valor.startsWith('data:image/')) {
              validExtras[recordKey] = record;
            }
            // Se é URI, verificar se arquivo existe
            else if (recordData.valor.startsWith('file://')) {
              try {
                const FileSystem = await import('expo-file-system');
                const fileInfo = await FileSystem.getInfoAsync(recordData.valor);
                
                if (fileInfo.exists) {
                  validExtras[recordKey] = record;
                } else {
                  cleaned.fotos_extras++;
                  console.log(`🗑️ Removida foto extra órfã: ${recordKey}`);
                }
              } catch (checkError) {
                cleaned.fotos_extras++;
                console.log(`🗑️ Removida foto extra com erro: ${recordKey}`);
              }
            }
            // Formato desconhecido, remover
            else {
              cleaned.fotos_extras++;
              console.log(`🗑️ Removida foto extra formato inválido: ${recordKey}`);
            }
          } else {
            cleaned.fotos_extras++;
            console.log(`🗑️ Removida foto extra valor inválido: ${recordKey}`);
          }
        }
        
        if (cleaned.fotos_extras > 0) {
          await AsyncStorage.setItem('offline_fotos_extras', JSON.stringify(validExtras));
          console.log(`✅ ${cleaned.fotos_extras} fotos extras órfãs removidas`);
        }
      }
    } catch (error) {
      errors.push(`Erro ao limpar offline_fotos_extras: ${error}`);
    }

    // 3. Limpar ações offline órfãs
    try {
      const actions = await getOfflineActions();
      const validActions: OfflineAction[] = [];
      
      for (const action of actions) {
        // Se a ação tem dados de foto
        if ((action.type === 'DADOS_RECORD' || action.type === 'PHOTO_INICIO' || action.type === 'PHOTO_FINAL') && action.data.photoUri) {
          const photoUri = action.data.photoUri;
          const isExtraPhoto = action.type === 'DADOS_RECORD' && action.data.entradaDadosId === null;
          
          // Se já é base64, manter
          if (photoUri.startsWith('data:image/')) {
            validActions.push(action);
          }
          // Se é URI, verificar se arquivo existe
          else if (photoUri.startsWith('file://')) {
            try {
              const FileSystem = await import('expo-file-system');
              const fileInfo = await FileSystem.getInfoAsync(photoUri);
              
              if (fileInfo.exists) {
                validActions.push(action);
              } else {
                cleaned.actions++;
                if (isExtraPhoto) {
                  console.log(`🗑️ Removida ação de foto extra órfã: ${action.id}`);
                } else {
                  console.log(`🗑️ Removida ação órfã: ${action.id}`);
                }
              }
            } catch (checkError) {
              cleaned.actions++;
              if (isExtraPhoto) {
                console.log(`🗑️ Removida ação de foto extra com erro: ${action.id}`);
              } else {
                console.log(`🗑️ Removida ação com erro: ${action.id}`);
              }
            }
          }
          // Formato desconhecido, remover
          else {
            cleaned.actions++;
            if (isExtraPhoto) {
              console.log(`🗑️ Removida ação de foto extra formato inválido: ${action.id}`);
            } else {
              console.log(`🗑️ Removida ação formato inválido: ${action.id}`);
            }
          }
        } else {
          // Ações que não são de foto, manter
          validActions.push(action);
        }
      }
      
      if (cleaned.actions > 0) {
        await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(validActions));
        console.log(`✅ ${cleaned.actions} ações órfãs removidas (incluindo fotos extras)`);
      }
    } catch (error) {
      errors.push(`Erro ao limpar ações offline: ${error}`);
    }

    const totalCleaned = cleaned.dados_records + cleaned.fotos_extras + cleaned.actions;
    
    if (totalCleaned > 0) {
      console.log(`🧹 Limpeza concluída: ${totalCleaned} itens órfãos removidos`);
    } else {
      console.log('✅ Nenhum dado órfão encontrado');
    }

    return { success: true, cleaned, errors };

  } catch (error) {
    console.error('💥 Erro na limpeza de dados órfãos:', error);
    return { 
      success: false, 
      cleaned, 
      errors: [...errors, error instanceof Error ? error.message : String(error)] 
    };
  }
}; 

/**
 * Limpa dados órfãos de fotos iniciais que podem estar causando detecção incorreta
 * USAR COM CUIDADO: Apenas para debug/correção de dados corrompidos
 */
export const debugClearOrphanedInitialPhotos = async (workOrderId: number): Promise<void> => {
  try {
    console.log(`🔍 DEBUG: Limpando dados órfãos de foto inicial da OS ${workOrderId}...`);

    // 1. Limpar ações offline órfãs de foto inicial
    const actions = await getOfflineActions();
    const initialPhotoActions = actions.filter(action => 
      action.type === 'PHOTO_INICIO' && 
      action.workOrderId === workOrderId
    );

    console.log(`📱 DEBUG: Encontradas ${initialPhotoActions.length} ações de foto inicial para OS ${workOrderId}:`);
    initialPhotoActions.forEach(action => {
      console.log(`   - ID: ${action.id}, Synced: ${action.synced}, Tentativas: ${action.attempts}`);
    });

    if (initialPhotoActions.length > 0) {
      // Remover ações órfãs
      const cleanActions = actions.filter(action => 
        !(action.type === 'PHOTO_INICIO' && action.workOrderId === workOrderId)
      );
      
      await AsyncStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(cleanActions));
      console.log(`🗑️ DEBUG: Removidas ${initialPhotoActions.length} ações órfãs de foto inicial`);
    }

    // 2. REMOVIDO: Limpeza no hybridStorage (não usado mais para evitar database full)
    // const photos = await hybridStorage.getPhotosByWorkOrder(workOrderId);
    // const initialPhotos = photos.filter(photo => photo.actionType === 'PHOTO_INICIO');
    
    console.log(`📸 DEBUG: Limpeza de fotos órfãs do hybridStorage DESABILITADA (usando AsyncStorage direto)`);
    
    // Nova lógica: Limpar dados órfãos apenas do AsyncStorage
    try {
      // Limpar dados de fotos órfãs que podem estar em chaves específicas
      const allKeys = await AsyncStorage.getAllKeys();
      const orphanedKeys = allKeys.filter(key => 
        key.includes(`_${workOrderId}_`) && 
        (key.startsWith('photo_') || key.startsWith('temp_'))
      );
      
      if (orphanedKeys.length > 0) {
        await AsyncStorage.multiRemove(orphanedKeys);
        console.log(`🗑️ DEBUG: Removidas ${orphanedKeys.length} chaves órfãs relacionadas à OS ${workOrderId}`);
      }
    } catch (cleanupError) {
      console.warn(`⚠️ DEBUG: Erro na limpeza de dados órfãos:`, cleanupError);
    }

  } catch (error) {
    console.error(`❌ DEBUG: Erro ao limpar dados órfãos:`, error);
  }
}; 

/**
 * Debug: Analisa status de sincronização de todas as fotos de uma OS
 * USAR PARA DEBUG: Mostra detalhes de sincronização de fotos
 */
export const debugSyncStatusForWorkOrder = async (workOrderId: number): Promise<void> => {
  try {
    console.log(`🔍 ===== DEBUG SYNC STATUS - OS ${workOrderId} =====`);
    
    let totalFotos = 0;
    let fotosSincronizadas = 0;
    let fotosNaoSincronizadas = 0;
    
    // 1. Verificar offline_dados_records (fotos principais)
    console.log('📸 1. VERIFICANDO OFFLINE_DADOS_RECORDS (Fotos Principais):');
    try {
      const offlineData = await AsyncStorage.getItem('offline_dados_records');
      if (offlineData) {
        const records = JSON.parse(offlineData);
        const workOrderRecords = Object.entries(records).filter(([_, record]: [string, any]) => 
          record.ordem_servico_id === workOrderId
        );
        
        console.log(`📱 Total de registros para OS ${workOrderId}: ${workOrderRecords.length}`);
        
        workOrderRecords.forEach(([recordKey, record], index) => {
          const recordData = record as any;
          totalFotos++;
          
          if (recordData.synced) {
            fotosSincronizadas++;
            console.log(`   ✅ ${index + 1}. ${recordKey}: SINCRONIZADA`);
            console.log(`      - Entrada ID: ${recordData.entrada_dados_id}`);
            console.log(`      - Supabase ID: ${recordData.supabase_id || 'N/A'}`);
            console.log(`      - Sync Date: ${recordData.synced_at || 'N/A'}`);
          } else {
            fotosNaoSincronizadas++;
            console.log(`   ❌ ${index + 1}. ${recordKey}: NÃO SINCRONIZADA`);
            console.log(`      - Entrada ID: ${recordData.entrada_dados_id}`);
            console.log(`      - Valor: ${recordData.valor ? recordData.valor.substring(0, 30) + '...' : 'VAZIO'}`);
            console.log(`      - Ativo: ${recordData.ativo}`);
          }
        });
      } else {
        console.log('📱 Nenhum offline_dados_records encontrado');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar offline_dados_records:', error);
    }
    
    // 2. Verificar offline_fotos_extras (fotos extras)
    console.log('\n📸 2. VERIFICANDO OFFLINE_FOTOS_EXTRAS (Fotos Extras):');
    try {
      const offlineExtrasData = await AsyncStorage.getItem('offline_fotos_extras');
      if (offlineExtrasData) {
        const extrasRecords = JSON.parse(offlineExtrasData);
        const workOrderExtras = Object.entries(extrasRecords).filter(([_, record]: [string, any]) => 
          record.ordem_servico_id === workOrderId
        );
        
        console.log(`📱 Total de fotos extras para OS ${workOrderId}: ${workOrderExtras.length}`);
        
        workOrderExtras.forEach(([recordKey, record], index) => {
          const recordData = record as any;
          totalFotos++;
          
          if (recordData.synced) {
            fotosSincronizadas++;
            console.log(`   ✅ ${index + 1}. ${recordKey}: SINCRONIZADA`);
            console.log(`      - Etapa ID: ${recordData.etapa_id}`);
            console.log(`      - Título: ${recordData.titulo}`);
            console.log(`      - Supabase ID: ${recordData.supabase_id || 'N/A'}`);
          } else {
            fotosNaoSincronizadas++;
            console.log(`   ❌ ${index + 1}. ${recordKey}: NÃO SINCRONIZADA`);
            console.log(`      - Etapa ID: ${recordData.etapa_id}`);
            console.log(`      - Título: ${recordData.titulo}`);
            console.log(`      - Valor: ${recordData.valor ? recordData.valor.substring(0, 30) + '...' : 'VAZIO'}`);
          }
        });
      } else {
        console.log('📱 Nenhuma offline_fotos_extras encontrada');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar offline_fotos_extras:', error);
    }
    
    // 3. Verificar offline_actions (ações pendentes)
    console.log('\n📸 3. VERIFICANDO OFFLINE_ACTIONS (Ações Pendentes):');
    try {
      const actions = await getOfflineActions();
      const workOrderActions = actions.filter(action => action.workOrderId === workOrderId);
      
      console.log(`📱 Total de ações para OS ${workOrderId}: ${workOrderActions.length}`);
      
      const photoActions = workOrderActions.filter(action => 
        action.type === 'DADOS_RECORD' || action.type === 'PHOTO_INICIO' || action.type === 'PHOTO_FINAL'
      );
      
      console.log(`📸 Ações relacionadas a fotos: ${photoActions.length}`);
      
      photoActions.forEach((action, index) => {
        if (action.synced) {
          console.log(`   ✅ ${index + 1}. ${action.id}: SINCRONIZADA`);
          console.log(`      - Tipo: ${action.type}`);
          console.log(`      - Tentativas: ${action.attempts}`);
        } else {
          console.log(`   ❌ ${index + 1}. ${action.id}: NÃO SINCRONIZADA`);
          console.log(`      - Tipo: ${action.type}`);
          console.log(`      - Tentativas: ${action.attempts}/${MAX_SYNC_ATTEMPTS}`);
          if (action.type === 'DADOS_RECORD') {
            console.log(`      - Entrada ID: ${action.data.entradaDadosId}`);
            const isExtra = action.data.entradaDadosId === null;
            console.log(`      - É foto extra: ${isExtra ? 'SIM' : 'NÃO'}`);
          }
        }
      });
    } catch (error) {
      console.error('❌ Erro ao verificar offline_actions:', error);
    }
    
    // 4. Resumo final
    console.log('\n📊 ===== RESUMO FINAL =====');
    console.log(`📸 Total de fotos encontradas: ${totalFotos}`);
    console.log(`✅ Fotos sincronizadas: ${fotosSincronizadas}`);
    console.log(`❌ Fotos não sincronizadas: ${fotosNaoSincronizadas}`);
    console.log(`📈 Taxa de sincronização: ${totalFotos > 0 ? Math.round((fotosSincronizadas / totalFotos) * 100) : 0}%`);
    
    if (fotosNaoSincronizadas > 0) {
      console.log('\n🔧 SUGESTÕES PARA CORRIGIR:');
      console.log('1. Verifique se está online');
      console.log('2. Execute syncAllPendingActions() manualmente');
      console.log('3. Verifique se há erros na tabela dados do Supabase');
    }
    
    console.log('🔍 ===== FIM DEBUG SYNC STATUS =====\n');
    
  } catch (error) {
    console.error('💥 Erro no debug de status de sincronização:', error);
  }
}; 

/**
 * Força sincronização imediata de todas as fotos pendentes de uma OS específica
 * USAR PARA DEBUG: Força sincronização quando há problemas
 */
export const forceSyncPhotosForWorkOrder = async (workOrderId: number): Promise<{
  success: boolean;
  results: {
    dados_records: { synced: number; errors: string[] };
    fotos_extras: { synced: number; errors: string[] };
    actions: { synced: number; errors: string[] };
  };
}> => {
  try {
    console.log(`🔄 ===== FORÇANDO SINCRONIZAÇÃO DE FOTOS - OS ${workOrderId} =====`);
    
    const results = {
      dados_records: { synced: 0, errors: [] as string[] },
      fotos_extras: { synced: 0, errors: [] as string[] },
      actions: { synced: 0, errors: [] as string[] }
    };
    
    // Verificar se está online
    const isOnline = await checkNetworkConnection();
    if (!isOnline) {
      console.log('❌ Sem conexão com a internet');
      return { success: false, results };
    }
    
    console.log('✅ Online - iniciando sincronização forçada...');
    
    // 1. Sincronizar offline_dados_records
    console.log('\n📸 1. SINCRONIZANDO DADOS_RECORDS...');
    try {
      const offlineData = await AsyncStorage.getItem('offline_dados_records');
      if (offlineData) {
        const records = JSON.parse(offlineData);
        const workOrderRecords = Object.entries(records).filter(([_, record]: [string, any]) => 
          record.ordem_servico_id === workOrderId && !record.synced
        );
        
        console.log(`📱 Encontrados ${workOrderRecords.length} dados_records não sincronizados`);
        
        for (const [recordKey, record] of workOrderRecords) {
          try {
            const recordData = record as any;
            
            const { data, error } = await saveDadosRecord(
              recordData.ordem_servico_id,
              recordData.entrada_dados_id,
              recordData.valor
            );
            
            if (!error && data) {
              // Marcar como sincronizado
              records[recordKey].synced = true;
              records[recordKey].synced_at = new Date().toISOString();
              records[recordKey].supabase_id = data.id;
              results.dados_records.synced++;
              
              console.log(`   ✅ ${recordKey} -> Supabase ID: ${data.id}`);
            } else {
              results.dados_records.errors.push(`${recordKey}: ${error}`);
              console.log(`   ❌ ${recordKey}: ${error}`);
            }
          } catch (recordError) {
            results.dados_records.errors.push(`${recordKey}: ${recordError}`);
            console.log(`   💥 ${recordKey}: ${recordError}`);
          }
        }
        
        // Salvar estado atualizado
        await AsyncStorage.setItem('offline_dados_records', JSON.stringify(records));
      }
    } catch (error) {
      results.dados_records.errors.push(`Erro geral: ${error}`);
    }
    
    // 2. Sincronizar offline_fotos_extras
    console.log('\n📸 2. SINCRONIZANDO FOTOS_EXTRAS...');
    try {
      const offlineExtrasData = await AsyncStorage.getItem('offline_fotos_extras');
      if (offlineExtrasData) {
        const extrasRecords = JSON.parse(offlineExtrasData);
        const workOrderExtras = Object.entries(extrasRecords).filter(([_, record]: [string, any]) => 
          record.ordem_servico_id === workOrderId && !record.synced
        );
        
        console.log(`📱 Encontradas ${workOrderExtras.length} fotos_extras não sincronizadas`);
        
        for (const [recordKey, record] of workOrderExtras) {
          try {
            const recordData = record as any;
            
            const { data, error } = await saveDadosRecord(
              recordData.ordem_servico_id,
              null, // entrada_dados_id especial para fotos extras
              recordData.valor
            );
            
            if (!error && data) {
              // Marcar como sincronizado
              extrasRecords[recordKey].synced = true;
              extrasRecords[recordKey].synced_at = new Date().toISOString();
              extrasRecords[recordKey].supabase_id = data.id;
              results.fotos_extras.synced++;
              
              console.log(`   ✅ ${recordKey} -> Supabase ID: ${data.id}`);
            } else {
              results.fotos_extras.errors.push(`${recordKey}: ${error}`);
              console.log(`   ❌ ${recordKey}: ${error}`);
            }
          } catch (recordError) {
            results.fotos_extras.errors.push(`${recordKey}: ${recordError}`);
            console.log(`   💥 ${recordKey}: ${recordError}`);
          }
        }
        
        // Salvar estado atualizado
        await AsyncStorage.setItem('offline_fotos_extras', JSON.stringify(extrasRecords));
      }
    } catch (error) {
      results.fotos_extras.errors.push(`Erro geral: ${error}`);
    }
    
    // 3. Sincronizar ações offline pendentes
    console.log('\n📸 3. SINCRONIZANDO ACTIONS...');
    try {
      const actions = await getOfflineActions();
      const workOrderActions = actions.filter(action => 
        action.workOrderId === workOrderId && 
        !action.synced && 
        (action.type === 'DADOS_RECORD' || action.type === 'PHOTO_INICIO' || action.type === 'PHOTO_FINAL')
      );
      
      console.log(`📱 Encontradas ${workOrderActions.length} ações não sincronizadas`);
      
      for (const action of workOrderActions) {
        try {
          const success = await syncAction(action);
          if (success) {
            await markActionAsSynced(action.id);
            results.actions.synced++;
            console.log(`   ✅ ${action.id} (${action.type})`);
          } else {
            results.actions.errors.push(`${action.id}: Falha na sincronização`);
            console.log(`   ❌ ${action.id} (${action.type}): Falha na sincronização`);
          }
        } catch (actionError) {
          results.actions.errors.push(`${action.id}: ${actionError}`);
          console.log(`   💥 ${action.id}: ${actionError}`);
        }
      }
    } catch (error) {
      results.actions.errors.push(`Erro geral: ${error}`);
    }
    
    // 4. Resumo final
    const totalSynced = results.dados_records.synced + results.fotos_extras.synced + results.actions.synced;
    const totalErrors = results.dados_records.errors.length + results.fotos_extras.errors.length + results.actions.errors.length;
    
    console.log('\n📊 ===== RESUMO DA SINCRONIZAÇÃO FORÇADA =====');
    console.log(`✅ Total sincronizado: ${totalSynced}`);
    console.log(`   - Dados Records: ${results.dados_records.synced}`);
    console.log(`   - Fotos Extras: ${results.fotos_extras.synced}`);
    console.log(`   - Actions: ${results.actions.synced}`);
    console.log(`❌ Total de erros: ${totalErrors}`);
    
    if (totalErrors > 0) {
      console.log('\n🔧 ERROS ENCONTRADOS:');
      [...results.dados_records.errors, ...results.fotos_extras.errors, ...results.actions.errors]
        .forEach((error, index) => console.log(`   ${index + 1}. ${error}`));
    }
    
    console.log('🔄 ===== FIM DA SINCRONIZAÇÃO FORÇADA =====\n');
    
    return {
      success: totalSynced > 0 || totalErrors === 0,
      results
    };
    
  } catch (error) {
    console.error('💥 Erro na sincronização forçada:', error);
    return {
      success: false,
      results: {
        dados_records: { synced: 0, errors: [`Erro crítico: ${error}`] },
        fotos_extras: { synced: 0, errors: [] },
        actions: { synced: 0, errors: [] }
      }
    };
  }
};

/**
 * Debug: Testa salvamento direto na tabela dados do Supabase
 * USAR PARA DEBUG: Testa se é possível salvar diretamente na tabela dados
 */
export const debugTestSaveDados = async (workOrderId: number): Promise<void> => {
  try {
    console.log(`🧪 ===== TESTE DE SALVAMENTO NA TABELA DADOS - OS ${workOrderId} =====`);
    
    // 1. Importar função e cliente Supabase
    const { saveDadosRecord } = await import('./serviceStepsService');
    const { supabase } = await import('./supabase');
    
    // 2. Criar dados de teste
    const testData = {
      base64Photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      workOrderId: workOrderId,
      entradaDadosId: 999999 // ID de teste
    };
    
    console.log('📊 Dados de teste:', {
      workOrderId: testData.workOrderId,
      entradaDadosId: testData.entradaDadosId,
      base64Size: testData.base64Photo.length
    });
    
    // 3. Testar conectividade
    const isOnline = await checkNetworkConnection();
    console.log(`🌐 Status de conectividade: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (!isOnline) {
      console.log('❌ Sem conexão - teste cancelado');
      return;
    }
    
    // 4. Testar salvamento direto via função saveDadosRecord
    console.log('\n📸 TESTE 1: Salvamento via saveDadosRecord...');
    const result1 = await saveDadosRecord(
      testData.workOrderId,
      testData.entradaDadosId,
      testData.base64Photo
    );
    
    if (result1.error) {
      console.log(`❌ ERRO na saveDadosRecord: ${result1.error}`);
    } else {
      console.log(`✅ SUCESSO na saveDadosRecord: ID ${result1.data?.id}`);
    }
    
    // 5. Testar salvamento direto via cliente Supabase
    console.log('\n📸 TESTE 2: Salvamento direto via cliente Supabase...');
    try {
      const insertData = {
        ativo: 1,
        valor: testData.base64Photo.replace(/^data:image\/[a-z]+;base64,/, ''), // Apenas base64 puro
        ordem_servico_id: testData.workOrderId,
        entrada_dados_id: testData.entradaDadosId + 1, // ID diferente para não conflitar
        created_at: new Date().toISOString(),
        dt_edicao: new Date().toISOString(),
      };
      
      const { data, error } = await supabase
        .from('dados')
        .insert(insertData)
        .select('*')
        .single();
      
      if (error) {
        console.log(`❌ ERRO direto no Supabase: ${error.message}`);
        console.log(`❌ Detalhes do erro:`, error);
      } else {
        console.log(`✅ SUCESSO direto no Supabase: ID ${data?.id}`);
      }
    } catch (directError) {
      console.log(`💥 ERRO CRÍTICO direto no Supabase:`, directError);
    }
    
    // 6. Verificar se os registros foram salvos
    console.log('\n📊 TESTE 3: Verificando registros salvos...');
    try {
      const { data: savedRecords, error: queryError } = await supabase
        .from('dados')
        .select('*')
        .eq('ordem_servico_id', testData.workOrderId)
        .in('entrada_dados_id', [testData.entradaDadosId, testData.entradaDadosId + 1])
        .order('created_at', { ascending: false });
      
      if (queryError) {
        console.log(`❌ ERRO ao consultar registros: ${queryError.message}`);
      } else {
        console.log(`📋 ${savedRecords?.length || 0} registros encontrados na tabela dados`);
        savedRecords?.forEach((record, index) => {
          console.log(`   ${index + 1}. ID: ${record.id}, entrada_dados_id: ${record.entrada_dados_id}, created_at: ${record.created_at}`);
        });
      }
    } catch (queryError) {
      console.log(`💥 ERRO CRÍTICO na consulta:`, queryError);
    }
    
    // 7. Limpar dados de teste
    console.log('\n🧹 TESTE 4: Limpando dados de teste...');
    try {
      const { error: deleteError } = await supabase
        .from('dados')
        .delete()
        .eq('ordem_servico_id', testData.workOrderId)
        .in('entrada_dados_id', [testData.entradaDadosId, testData.entradaDadosId + 1]);
      
      if (deleteError) {
        console.log(`⚠️ Erro ao limpar dados de teste: ${deleteError.message}`);
      } else {
        console.log(`✅ Dados de teste removidos com sucesso`);
      }
    } catch (deleteError) {
      console.log(`⚠️ Erro ao limpar dados de teste:`, deleteError);
    }
    
    console.log('🧪 ===== FIM DO TESTE DE SALVAMENTO =====\n');
    
  } catch (error) {
    console.error('💥 Erro crítico no teste de salvamento:', error);
  }
};

/**
 * Debug: Diagnóstico completo e sincronização forçada com logs detalhados
 * USAR PARA DEBUG: Análise completa e tentativa de sincronização de todas as fotos
 */
export const debugFullDiagnosticAndSync = async (workOrderId: number): Promise<void> => {
  try {
    console.log(`🔬 ===== DIAGNÓSTICO COMPLETO E SINCRONIZAÇÃO - OS ${workOrderId} =====`);
    
    // 1. Verificar conectividade
    const isOnline = await checkNetworkConnection();
    console.log(`🌐 Status de conectividade: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    if (!isOnline) {
      console.log('❌ Sem conexão - diagnóstico limitado');
      return;
    }
    
    // 2. Importar dependências
    const { saveDadosRecord } = await import('./serviceStepsService');
    const { supabase } = await import('./supabase');
    
    let totalPhotosFound = 0;
    let totalPhotosSynced = 0;
    let totalErrors = 0;
    const detailedErrors: string[] = [];
    
    // 3. DIAGNÓSTICO: offline_dados_records
    console.log('\n📊 FASE 1: DIAGNÓSTICO DE OFFLINE_DADOS_RECORDS');
    try {
      const offlineData = await AsyncStorage.getItem('offline_dados_records');
      if (offlineData) {
        const records = JSON.parse(offlineData);
        const workOrderRecords = Object.entries(records).filter(([_, record]: [string, any]) => 
          record.ordem_servico_id === workOrderId
        );
        
        console.log(`📱 Encontrados ${workOrderRecords.length} registros de dados para OS ${workOrderId}`);
        
        for (const [recordKey, record] of workOrderRecords) {
          const recordData = record as any;
          totalPhotosFound++;
          
          console.log(`\n🔍 Analisando: ${recordKey}`);
          console.log(`   - Entrada ID: ${recordData.entrada_dados_id}`);
          console.log(`   - Sincronizado: ${recordData.synced ? 'SIM' : 'NÃO'}`);
          console.log(`   - Valor válido: ${recordData.valor ? 'SIM' : 'NÃO'}`);
          console.log(`   - Tipo do valor: ${recordData.valor ? recordData.valor.substring(0, 20) + '...' : 'N/A'}`);
          
          if (!recordData.synced && recordData.valor) {
            console.log(`🔄 Tentando sincronizar: ${recordKey}`);
            
            try {
              const { data, error } = await saveDadosRecord(
                recordData.ordem_servico_id,
                recordData.entrada_dados_id,
                recordData.valor
              );
              
              if (error) {
                console.log(`❌ ERRO na sincronização: ${error}`);
                detailedErrors.push(`${recordKey}: ${error}`);
                totalErrors++;
              } else {
                console.log(`✅ SUCESSO: ${recordKey} -> Supabase ID: ${data?.id}`);
                
                // Marcar como sincronizado
                records[recordKey].synced = true;
                records[recordKey].synced_at = new Date().toISOString();
                records[recordKey].supabase_id = data?.id;
                totalPhotosSynced++;
              }
            } catch (syncError) {
              console.log(`💥 ERRO CRÍTICO na sincronização: ${syncError}`);
              detailedErrors.push(`${recordKey}: ${syncError}`);
              totalErrors++;
            }
          } else if (recordData.synced) {
            console.log(`✅ Já sincronizado: Supabase ID: ${recordData.supabase_id || 'N/A'}`);
          }
        }
        
        // Salvar estado atualizado
        await AsyncStorage.setItem('offline_dados_records', JSON.stringify(records));
      } else {
        console.log('📱 Nenhum offline_dados_records encontrado');
      }
    } catch (error) {
      console.log(`💥 ERRO no diagnóstico de dados_records: ${error}`);
      detailedErrors.push(`Dados Records: ${error}`);
    }
    
    // 4. DIAGNÓSTICO: offline_fotos_extras
    console.log('\n📊 FASE 2: DIAGNÓSTICO DE OFFLINE_FOTOS_EXTRAS');
    try {
      const offlineExtrasData = await AsyncStorage.getItem('offline_fotos_extras');
      if (offlineExtrasData) {
        const extrasRecords = JSON.parse(offlineExtrasData);
        const workOrderExtras = Object.entries(extrasRecords).filter(([_, record]: [string, any]) => 
          record.ordem_servico_id === workOrderId
        );
        
        console.log(`📱 Encontradas ${workOrderExtras.length} fotos extras para OS ${workOrderId}`);
        
        for (const [recordKey, record] of workOrderExtras) {
          const recordData = record as any;
          totalPhotosFound++;
          
          console.log(`\n🔍 Analisando foto extra: ${recordKey}`);
          console.log(`   - Etapa ID: ${recordData.etapa_id}`);
          console.log(`   - Título: ${recordData.titulo}`);
          console.log(`   - Sincronizado: ${recordData.synced ? 'SIM' : 'NÃO'}`);
          console.log(`   - Valor válido: ${recordData.valor ? 'SIM' : 'NÃO'}`);
          
          if (!recordData.synced && recordData.valor) {
            console.log(`🔄 Tentando sincronizar foto extra: ${recordKey}`);
            
            try {
              // Para fotos extras, usar entrada_dados_id = null
              const { data, error } = await saveDadosRecord(
                recordData.ordem_servico_id,
                null, // entrada_dados_id especial para fotos extras
                recordData.valor
              );
              
              if (error) {
                console.log(`❌ ERRO na sincronização da foto extra: ${error}`);
                detailedErrors.push(`${recordKey} (extra): ${error}`);
                totalErrors++;
              } else {
                console.log(`✅ SUCESSO foto extra: ${recordKey} -> Supabase ID: ${data?.id}`);
                
                // Marcar como sincronizado
                extrasRecords[recordKey].synced = true;
                extrasRecords[recordKey].synced_at = new Date().toISOString();
                extrasRecords[recordKey].supabase_id = data?.id;
                totalPhotosSynced++;
              }
            } catch (syncError) {
              console.log(`💥 ERRO CRÍTICO na sincronização da foto extra: ${syncError}`);
              detailedErrors.push(`${recordKey} (extra): ${syncError}`);
              totalErrors++;
            }
          } else if (recordData.synced) {
            console.log(`✅ Foto extra já sincronizada: Supabase ID: ${recordData.supabase_id || 'N/A'}`);
          }
        }
        
        // Salvar estado atualizado
        await AsyncStorage.setItem('offline_fotos_extras', JSON.stringify(extrasRecords));
      } else {
        console.log('📱 Nenhuma offline_fotos_extras encontrada');
      }
    } catch (error) {
      console.log(`💥 ERRO no diagnóstico de fotos_extras: ${error}`);
      detailedErrors.push(`Fotos Extras: ${error}`);
    }
    
    // 5. DIAGNÓSTICO: offline_actions
    console.log('\n📊 FASE 3: DIAGNÓSTICO DE OFFLINE_ACTIONS');
    try {
      const actions = await getOfflineActions();
      const workOrderActions = actions.filter(action => 
        action.workOrderId === workOrderId && 
        (action.type === 'DADOS_RECORD' || action.type === 'PHOTO_INICIO' || action.type === 'PHOTO_FINAL')
      );
      
      console.log(`📱 Encontradas ${workOrderActions.length} ações de foto para OS ${workOrderId}`);
      
      for (const action of workOrderActions) {
        console.log(`\n🔍 Analisando ação: ${action.id}`);
        console.log(`   - Tipo: ${action.type}`);
        console.log(`   - Sincronizado: ${action.synced ? 'SIM' : 'NÃO'}`);
        console.log(`   - Tentativas: ${action.attempts}`);
        
        if (action.type === 'DADOS_RECORD') {
          const isExtra = action.data.entradaDadosId === null;
          console.log(`   - Entrada ID: ${action.data.entradaDadosId} ${isExtra ? '(FOTO EXTRA)' : ''}`);
        }
        
        if (!action.synced && action.attempts < MAX_SYNC_ATTEMPTS) {
          console.log(`🔄 Tentando sincronizar ação: ${action.id}`);
          
          try {
            const success = await syncAction(action);
            if (success) {
              await markActionAsSynced(action.id);
              console.log(`✅ SUCESSO na ação: ${action.id}`);
              totalPhotosSynced++;
            } else {
              console.log(`❌ FALHA na ação: ${action.id}`);
              detailedErrors.push(`Ação ${action.id}: Falha na sincronização`);
              totalErrors++;
            }
          } catch (actionError) {
            console.log(`💥 ERRO CRÍTICO na ação: ${actionError}`);
            detailedErrors.push(`Ação ${action.id}: ${actionError}`);
            totalErrors++;
          }
        } else if (action.synced) {
          console.log(`✅ Ação já sincronizada`);
        } else if (action.attempts >= MAX_SYNC_ATTEMPTS) {
          console.log(`⚠️ Ação excedeu tentativas máximas`);
        }
      }
    } catch (error) {
      console.log(`💥 ERRO no diagnóstico de ações: ${error}`);
      detailedErrors.push(`Actions: ${error}`);
    }
    
    // 6. VERIFICAR REGISTROS NO SUPABASE
    console.log('\n📊 FASE 4: VERIFICAÇÃO NO SUPABASE');
    try {
      const { data: supabaseRecords, error: queryError } = await supabase
        .from('dados')
        .select('*')
        .eq('ordem_servico_id', workOrderId)
        .order('created_at', { ascending: false });
      
      if (queryError) {
        console.log(`❌ ERRO ao consultar Supabase: ${queryError.message}`);
      } else {
        console.log(`📋 ${supabaseRecords?.length || 0} registros encontrados no Supabase para OS ${workOrderId}`);
        supabaseRecords?.forEach((record, index) => {
          const isExtra = record.entrada_dados_id === null;
          console.log(`   ${index + 1}. ID: ${record.id}, entrada_dados_id: ${record.entrada_dados_id}${isExtra ? ' (EXTRA)' : ''}, created_at: ${record.created_at}`);
        });
      }
    } catch (error) {
      console.log(`💥 ERRO CRÍTICO na consulta Supabase: ${error}`);
    }
    
    // 7. RESUMO FINAL
    console.log('\n📊 ===== RESUMO DO DIAGNÓSTICO =====');
    console.log(`🔍 Total de fotos encontradas: ${totalPhotosFound}`);
    console.log(`✅ Total de fotos sincronizadas: ${totalPhotosSynced}`);
    console.log(`❌ Total de erros: ${totalErrors}`);
    console.log(`📈 Taxa de sucesso: ${totalPhotosFound > 0 ? Math.round((totalPhotosSynced / totalPhotosFound) * 100) : 0}%`);
    
    if (detailedErrors.length > 0) {
      console.log('\n🔧 ERROS DETALHADOS:');
      detailedErrors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log('🔬 ===== FIM DO DIAGNÓSTICO COMPLETO =====\n');
    
  } catch (error) {
    console.error('💥 Erro crítico no diagnóstico completo:', error);
  }
};