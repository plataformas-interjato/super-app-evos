import AsyncStorage from '@react-native-async-storage/async-storage';
import unifiedOfflineDataService from './unifiedOfflineDataService';

/**
 * SERVIÇO DE MIGRAÇÃO ASYNCSTORAGE → FILESYSTEM
 * 
 * Migra dados órfãos do AsyncStorage para o sistema unificado
 */

export const migrateAsyncStorageToUnified = async (): Promise<{
  success: boolean;
  migrated: number;
  errors: string[];
}> => {
  const errors: string[] = [];
  let migrated = 0;
  
  try {
    console.log('🔄 [MIGRATION] Iniciando migração AsyncStorage → FileSystem...');
    
    // 1. Migrar offline_dados_records
    try {
      const offlineData = await AsyncStorage.getItem('offline_dados_records');
      if (offlineData) {
        const records = JSON.parse(offlineData);
        console.log(`📦 [MIGRATION] Encontrados ${Object.keys(records).length} registros offline_dados_records`);
        
        for (const [key, record] of Object.entries(records as any)) {
          try {
            if (!record.synced && record.ordem_servico_id && record.entrada_dados_id) {
              const result = await unifiedOfflineDataService.saveDadosRecord(
                record.ordem_servico_id,
                'migrated_user',
                record.entrada_dados_id,
                record.valor || record.photoUri
              );
              
              if (result.success) {
                migrated++;
                console.log(`✅ [MIGRATION] Registro ${key} migrado com sucesso`);
              } else {
                errors.push(`Erro ao migrar registro ${key}: ${result.error}`);
              }
            }
          } catch (recordError) {
            errors.push(`Erro no registro ${key}: ${recordError instanceof Error ? recordError.message : 'Erro desconhecido'}`);
          }
        }
        
        // Remover dados migrados
        await AsyncStorage.removeItem('offline_dados_records');
        console.log('🗑️ [MIGRATION] offline_dados_records removido do AsyncStorage');
      }
    } catch (error) {
      errors.push(`Erro ao migrar offline_dados_records: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
    
    // 2. Migrar offline_fotos_extras  
    try {
      const extrasData = await AsyncStorage.getItem('offline_fotos_extras');
      if (extrasData) {
        const extras = JSON.parse(extrasData);
        console.log(`📦 [MIGRATION] Encontrados ${Object.keys(extras).length} registros offline_fotos_extras`);
        
        for (const [key, extra] of Object.entries(extras as any)) {
          try {
            if (!extra.synced && extra.ordem_servico_id) {
              const result = await unifiedOfflineDataService.saveDadosRecord(
                extra.ordem_servico_id,
                'migrated_user',
                extra.entrada_dados_id || 999999, // ID genérico para fotos extras
                extra.photoUri || extra.valor
              );
              
              if (result.success) {
                migrated++;
                console.log(`✅ [MIGRATION] Foto extra ${key} migrada com sucesso`);
              } else {
                errors.push(`Erro ao migrar foto extra ${key}: ${result.error}`);
              }
            }
          } catch (extraError) {
            errors.push(`Erro na foto extra ${key}: ${extraError instanceof Error ? extraError.message : 'Erro desconhecido'}`);
          }
        }
        
        // Remover dados migrados
        await AsyncStorage.removeItem('offline_fotos_extras');
        console.log('🗑️ [MIGRATION] offline_fotos_extras removido do AsyncStorage');
      }
    } catch (error) {
      errors.push(`Erro ao migrar offline_fotos_extras: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
    
    // 3. Migrar offline_actions (se existir)
    try {
      const actionsData = await AsyncStorage.getItem('offline_actions');
      if (actionsData) {
        const actions = JSON.parse(actionsData);
        console.log(`📦 [MIGRATION] Encontrados ${Object.keys(actions).length} registros offline_actions`);
        
        for (const [key, action] of Object.entries(actions as any)) {
          try {
            if (!action.synced && action.workOrderId) {
              // Tentar identificar o tipo de ação e migrar adequadamente
              if (action.data?.photoUri || action.data?.photoBase64) {
                const result = await unifiedOfflineDataService.saveDadosRecord(
                  action.workOrderId,
                  'migrated_user',
                  action.data.entradaDadosId || 999999,
                  action.data.photoUri || action.data.photoBase64
                );
                
                if (result.success) {
                  migrated++;
                  console.log(`✅ [MIGRATION] Ação ${key} migrada como dados record`);
                } else {
                  errors.push(`Erro ao migrar ação ${key}: ${result.error}`);
                }
              }
            }
          } catch (actionError) {
            errors.push(`Erro na ação ${key}: ${actionError instanceof Error ? actionError.message : 'Erro desconhecido'}`);
          }
        }
        
        // Remover dados migrados
        await AsyncStorage.removeItem('offline_actions');
        console.log('🗑️ [MIGRATION] offline_actions removido do AsyncStorage');
      }
    } catch (error) {
      errors.push(`Erro ao migrar offline_actions: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
    
    console.log(`✅ [MIGRATION] Migração concluída: ${migrated} itens migrados, ${errors.length} erros`);
    
    if (errors.length > 0) {
      console.log('⚠️ [MIGRATION] Erros encontrados:');
      errors.forEach(error => console.log(`   - ${error}`));
    }
    
    return {
      success: errors.length === 0,
      migrated,
      errors
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ [MIGRATION] Erro crítico na migração:', errorMsg);
    
    return {
      success: false,
      migrated,
      errors: [...errors, `Erro crítico: ${errorMsg}`]
    };
  }
};

/**
 * VERIFICAR SE HÁ DADOS PARA MIGRAR
 */
export const checkDataToMigrate = async (): Promise<{
  hasData: boolean;
  counts: {
    offline_dados_records: number;
    offline_fotos_extras: number;
    offline_actions: number;
  };
}> => {
  try {
    const counts = {
      offline_dados_records: 0,
      offline_fotos_extras: 0,
      offline_actions: 0
    };
    
    // Verificar offline_dados_records
    const offlineData = await AsyncStorage.getItem('offline_dados_records');
    if (offlineData) {
      const records = JSON.parse(offlineData);
      counts.offline_dados_records = Object.keys(records).length;
    }
    
    // Verificar offline_fotos_extras
    const extrasData = await AsyncStorage.getItem('offline_fotos_extras');
    if (extrasData) {
      const extras = JSON.parse(extrasData);
      counts.offline_fotos_extras = Object.keys(extras).length;
    }
    
    // Verificar offline_actions
    const actionsData = await AsyncStorage.getItem('offline_actions');
    if (actionsData) {
      const actions = JSON.parse(actionsData);
      counts.offline_actions = Object.keys(actions).length;
    }
    
    const hasData = counts.offline_dados_records > 0 || counts.offline_fotos_extras > 0 || counts.offline_actions > 0;
    
    return { hasData, counts };
    
  } catch (error) {
    console.error('❌ [MIGRATION] Erro ao verificar dados para migração:', error);
    return {
      hasData: false,
      counts: { offline_dados_records: 0, offline_fotos_extras: 0, offline_actions: 0 }
    };
  }
}; 