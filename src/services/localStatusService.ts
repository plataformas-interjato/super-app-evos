import secureDataStorage from './secureDataStorageService';
import { updateWorkOrderInCache } from './workOrderCacheService';

const LOCAL_STATUS_PREFIX = 'local_status_';

interface LocalWorkOrderStatusMap {
  [workOrderId: string]: {
    status: string;
    timestamp: string;
    synced: boolean;
  };
}

interface SingleLocalStatus {
  status: string;
  updatedAt: string;
  synced: boolean;
}

/**
 * Atualiza o status local de uma OS (FileSystem)
 */
export const updateLocalWorkOrderStatus = async (
  workOrderId: number,
  status: 'aguardando' | 'em_progresso' | 'finalizada' | 'cancelada',
  synced: boolean = false
): Promise<void> => {
  const statusData: SingleLocalStatus = {
    status,
    synced,
    updatedAt: new Date().toISOString(),
  };

  await secureDataStorage.initialize();
  await secureDataStorage.saveData('USER_ACTIONS', [statusData], `${LOCAL_STATUS_PREFIX}${workOrderId}`);

  // Atualizar no cache de OSs se existir (reflete imediatamente na Home)
  try {
    await updateWorkOrderInCache(workOrderId, { status });
  } catch {}
};

/**
 * Busca o status local de uma OS (FileSystem)
 */
export const getLocalWorkOrderStatus = async (
  workOrderId: number
): Promise<{ status: string; synced: boolean } | null> => {
  try {
    await secureDataStorage.initialize();
    const res = await secureDataStorage.getData<SingleLocalStatus>('USER_ACTIONS', `${LOCAL_STATUS_PREFIX}${workOrderId}`);
    if (res.data && res.data.length > 0) {
      const st = res.data[0];
      return { status: st.status, synced: st.synced };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Busca todos os status locais (FileSystem)
 */
export const getLocalWorkOrderStatuses = async (): Promise<LocalWorkOrderStatusMap> => {
  try {
    await secureDataStorage.initialize();
    const all = await secureDataStorage.getAllMetadata();
    const targets = Object.values(all).filter(m => m.dataType === 'USER_ACTIONS' && m.id.startsWith(LOCAL_STATUS_PREFIX));

    const statuses: LocalWorkOrderStatusMap = {};

    for (const meta of targets) {
      const workOrderId = meta.id.replace(LOCAL_STATUS_PREFIX, '');
      const res = await secureDataStorage.getData<SingleLocalStatus>('USER_ACTIONS', meta.id);
      if (res.data && res.data.length > 0) {
        const st = res.data[0];
        statuses[workOrderId] = {
          status: st.status,
          timestamp: st.updatedAt,
          synced: st.synced,
        };
      }
    }

    return statuses;
  } catch {
    return {};
  }
};

/**
 * Marca um status local como sincronizado (FileSystem)
 */
export const markLocalStatusAsSynced = async (workOrderId: number): Promise<void> => {
  try {
    await secureDataStorage.initialize();
    const res = await secureDataStorage.getData<SingleLocalStatus>('USER_ACTIONS', `${LOCAL_STATUS_PREFIX}${workOrderId}`);
    const current: SingleLocalStatus | null = res.data && res.data.length > 0 ? res.data[0] : null;
    if (current) {
      current.synced = true;
      current.updatedAt = new Date().toISOString();
      await secureDataStorage.saveData('USER_ACTIONS', [current], `${LOCAL_STATUS_PREFIX}${workOrderId}`);
    }
  } catch {
    // no-op
  }
};

/**
 * Limpa TODOS os dados locais de uma OS específica quando finalizada online
 * (compatível com FileSystem unificado)
 */
export const clearAllLocalDataForWorkOrder = async (workOrderId: number): Promise<void> => {
  try {
    // Apenas marcar status como sincronizado; dados de fotos/comentários são geridos pelo sistema unificado
    await markLocalStatusAsSynced(workOrderId);
  } catch {
    // no-op
  }
};

/**
 * Remove status locais já sincronizados (para limpar indicadores visuais)
 */
export const cleanSyncedLocalStatuses = async (): Promise<void> => {
  try {
    await secureDataStorage.initialize();
    const all = await secureDataStorage.getAllMetadata();
    const targets = Object.values(all).filter(m => m.dataType === 'USER_ACTIONS' && m.id.startsWith(LOCAL_STATUS_PREFIX));
    for (const meta of targets) {
      const res = await secureDataStorage.getData<SingleLocalStatus>('USER_ACTIONS', meta.id);
      const current = res.data && res.data.length > 0 ? res.data[0] : null;
      if (current && current.synced) {
        // Regravar vazio para limpar (sem API dedicada de delete)
        await secureDataStorage.saveData('USER_ACTIONS', [], meta.id);
      }
    }
  } catch {
    // no-op
  }
};

/**
 * Remove status locais antigos (mais de 30 dias)
 */
export const cleanOldLocalStatuses = async (): Promise<void> => {
  try {
    await secureDataStorage.initialize();
    const all = await secureDataStorage.getAllMetadata();
    const targets = Object.values(all).filter(m => m.dataType === 'USER_ACTIONS' && m.id.startsWith(LOCAL_STATUS_PREFIX));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    for (const meta of targets) {
      const res = await secureDataStorage.getData<SingleLocalStatus>('USER_ACTIONS', meta.id);
      const current = res.data && res.data.length > 0 ? res.data[0] : null;
      if (current) {
        const dt = new Date(current.updatedAt);
        if (dt <= cutoff) {
          await secureDataStorage.saveData('USER_ACTIONS', [], meta.id);
        }
      }
    }
  } catch {
    // no-op
  }
}; 