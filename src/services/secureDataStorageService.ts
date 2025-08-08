import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * SERVIÇO DE ARMAZENAMENTO SEGURO DE DADOS
 * 
 * Armazena dados estruturados (etapas, entradas, etc.) no FileSystem
 * usando a mesma estratégia segura das fotos.
 */

// DIRETÓRIO SEGURO - mesmo padrão das fotos
const SECURE_DATA_DIR = Platform.select({
  ios: `${FileSystem.documentDirectory}Library/Application Support/AppData/`,
  android: `${FileSystem.documentDirectory}AppData/`
}) as string; // Type assertion para garantir que não é undefined

const BACKUP_DATA_DIR = `${FileSystem.cacheDirectory}backup_data/`;
const METADATA_KEY = 'secure_data_metadata';

// TIPOS DE DADOS SUPORTADOS
export type DataType =
  | 'WORK_ORDERS'
  | 'TIPOS_OS'
  | 'ETAPAS_OS'
  | 'ENTRADAS_DADOS'
  | 'CACHE_ETAPAS'
  | 'CACHE_ENTRADAS'
  | 'APP_USER';

export interface DataFileMetadata {
  id: string;
  filename: string;
  secureFilePath: string;
  backupFilePath?: string;
  dataType: DataType;
  timestamp: string;
  size: number;
  recordCount: number;
  version: number;
  fresh: boolean; // Se é recente (menos de 24h)
}

export interface DataMetadataStorage {
  [dataId: string]: DataFileMetadata;
}

export interface OfflineEtapa {
  id: number;
  titulo: string;
  ordem_etapa: number;
  tipo_os_id: number;
  ativo: number;
}

export interface OfflineEntradaDados {
  id: number;
  etapa_os_id: number;
  ordem_entrada: number;
  titulo: string;
  obrigatorio: number;
  tipo_campo: string;
  valor_padrao?: string;
  foto_modelo?: string;
}

export interface OfflineTipoOS {
  id: number;
  titulo: string;
  descricao?: string;
  ativo: number;
}

class SecureDataStorageService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Criar diretórios seguros
      await this.createDirectories();
      this.initialized = true;
      console.log('✅ SecureDataStorage inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar SecureDataStorage:', error);
      throw error;
    }
  }

  private async createDirectories(): Promise<void> {
    // Criar diretório principal seguro
    const secureInfo = await FileSystem.getInfoAsync(SECURE_DATA_DIR);
    if (!secureInfo.exists) {
      await FileSystem.makeDirectoryAsync(SECURE_DATA_DIR, { intermediates: true });
      console.log('📁 Diretório seguro de dados criado:', SECURE_DATA_DIR);
    }

    // Criar diretório de backup
    const backupInfo = await FileSystem.getInfoAsync(BACKUP_DATA_DIR);
    if (!backupInfo.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DATA_DIR, { intermediates: true });
      console.log('📁 Diretório de backup de dados criado:', BACKUP_DATA_DIR);
    }
  }

  /**
   * SALVAR DADOS NO FILESYSTEM
   */
  async saveData<T = any>(
    dataType: DataType,
    data: T[],
    customId?: string
  ): Promise<{
    success: boolean;
    dataId: string;
    error?: string;
  }> {
    
    try {
      await this.initialize();

      const dataId = customId || `${dataType}_${Date.now()}`;
      const filename = `${dataId}.json`;
      const secureFilePath = `${SECURE_DATA_DIR}${filename}`;
      const backupFilePath = `${BACKUP_DATA_DIR}${filename}`;

      console.log(`💾 [SECURE-DATA] Salvando ${dataType}:`, {
        dataId,
        recordCount: data.length,
        filename
      });

      const dataString = JSON.stringify(data, null, 2);
      const dataSize = dataString.length;

      // Salvar no diretório seguro principal
      await FileSystem.writeAsStringAsync(secureFilePath, dataString);

      // Backup no cache directory
      try {
        await FileSystem.writeAsStringAsync(backupFilePath, dataString);
      } catch (backupError) {
        console.warn('⚠️ Erro no backup, continuando...', backupError);
      }

      // Salvar metadata
      const metadata: DataFileMetadata = {
        id: dataId,
        filename,
        secureFilePath,
        backupFilePath,
        dataType,
        timestamp: new Date().toISOString(),
        size: dataSize,
        recordCount: data.length,
        version: Date.now(),
        fresh: true
      };

      await this.saveMetadata(dataId, metadata);

      console.log(`✅ [SECURE-DATA] ${dataType} salvo com sucesso:`, {
        dataId,
        size: `${(dataSize / 1024).toFixed(1)} KB`,
        records: data.length
      });

      return { success: true, dataId };

    } catch (error) {
      console.error(`❌ [SECURE-DATA] Erro ao salvar ${dataType}:`, error);
      return {
        success: false,
        dataId: '',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * RECUPERAR DADOS DO FILESYSTEM
   */
  async getData<T = any>(dataType: DataType, dataId?: string): Promise<{
    data: T[] | null;
    fromBackup: boolean;
    metadata?: DataFileMetadata;
  }> {
    
    try {
      await this.initialize();

      // Se não especificou ID, buscar o mais recente deste tipo
      let targetId = dataId;
      if (!targetId) {
        const allMetadata = await this.getAllMetadata();
        const typeFiles = Object.values(allMetadata)
          .filter(meta => meta.dataType === dataType)
          .sort((a, b) => b.version - a.version);
        
        if (typeFiles.length === 0) {
          console.log(`📭 [SECURE-DATA] Nenhum arquivo ${dataType} encontrado`);
          return { data: null, fromBackup: false };
        }
        
        targetId = typeFiles[0].id;
      }

      const metadata = await this.getMetadata(targetId);
      if (!metadata) {
        // console.log(`📭 [SECURE-DATA] Metadata não encontrado para ${targetId}`);
        return { data: null, fromBackup: false };
      }

      console.log(`🔍 [SECURE-DATA] Carregando ${dataType} (${targetId})...`);

      // Tentar carregar do arquivo principal
      try {
        const secureInfo = await FileSystem.getInfoAsync(metadata.secureFilePath);
        if (secureInfo.exists) {
          const dataString = await FileSystem.readAsStringAsync(metadata.secureFilePath);
          const data = JSON.parse(dataString);
          
          console.log(`✅ [SECURE-DATA] ${dataType} carregado do arquivo principal: ${data.length} registros`);
          return { data, fromBackup: false, metadata };
        }
      } catch (mainError) {
        console.warn(`⚠️ [SECURE-DATA] Erro no arquivo principal, tentando backup...`, mainError);
      }

      // Tentar carregar do backup
      if (metadata.backupFilePath) {
        try {
          const backupInfo = await FileSystem.getInfoAsync(metadata.backupFilePath);
          if (backupInfo.exists) {
            const dataString = await FileSystem.readAsStringAsync(metadata.backupFilePath);
            const data = JSON.parse(dataString);
            
            console.log(`✅ [SECURE-DATA] ${dataType} carregado do backup: ${data.length} registros`);
            return { data, fromBackup: true, metadata };
          }
        } catch (backupError) {
          console.error(`❌ [SECURE-DATA] Erro no backup também:`, backupError);
        }
      }

      console.log(`❌ [SECURE-DATA] ${dataType} não encontrado em lugar nenhum`);
      return { data: null, fromBackup: false };

    } catch (error) {
      console.error(`💥 [SECURE-DATA] Erro ao carregar ${dataType}:`, error);
      return { data: null, fromBackup: false };
    }
  }

  /**
   * BUSCAR ETAPAS POR TIPO DE OS
   */
  async getEtapasByTipoOS(tipoOsId: number): Promise<{
    etapas: OfflineEtapa[];
    fromCache: boolean;
    error?: string;
  }> {
    
    try {
      // Tentar cache específico primeiro
      const cacheResult = await this.getData<OfflineEtapa>('CACHE_ETAPAS', `cache_etapas_tipo_${tipoOsId}`);
      
      if (cacheResult.data && cacheResult.data.length > 0) {
        console.log(`✅ [SECURE-DATA] ${cacheResult.data.length} etapas do tipo ${tipoOsId} encontradas no cache`);
        return { etapas: cacheResult.data, fromCache: true };
      }

      // Buscar no arquivo geral de etapas
      const allEtapasResult = await this.getData<OfflineEtapa>('ETAPAS_OS');
      
      if (allEtapasResult.data) {
        const etapasFiltradas = allEtapasResult.data.filter(etapa => 
          etapa.tipo_os_id === tipoOsId && etapa.ativo === 1
        );
        
        if (etapasFiltradas.length > 0) {
          // Salvar cache para próxima busca
          await this.saveData('CACHE_ETAPAS', etapasFiltradas, `cache_etapas_tipo_${tipoOsId}`);
          
          console.log(`✅ [SECURE-DATA] ${etapasFiltradas.length} etapas do tipo ${tipoOsId} encontradas (e cacheadas)`);
          return { etapas: etapasFiltradas, fromCache: false };
        }
      }

      // Fallback: etapas genéricas
      console.log(`⚠️ [SECURE-DATA] Usando etapas genéricas para tipo ${tipoOsId}`);
      return {
        etapas: [
          {
            id: 999001,
            titulo: 'Documentação Fotográfica',
            ordem_etapa: 1,
            tipo_os_id: tipoOsId,
            ativo: 1
          },
          {
            id: 999002,
            titulo: 'Verificação Final',
            ordem_etapa: 2,
            tipo_os_id: tipoOsId,
            ativo: 1
          }
        ],
        fromCache: false
      };

    } catch (error) {
      console.error(`💥 [SECURE-DATA] Erro ao buscar etapas do tipo ${tipoOsId}:`, error);
      return {
        etapas: [],
        fromCache: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * BUSCAR ENTRADAS POR ETAPA
   */
  async getEntradasByEtapa(etapaOsId: number): Promise<{
    entradas: OfflineEntradaDados[];
    fromCache: boolean;
    error?: string;
  }> {
    
    try {
      // Tentar cache específico primeiro
      const cacheResult = await this.getData<OfflineEntradaDados>('CACHE_ENTRADAS', `cache_entradas_etapa_${etapaOsId}`);
      
      if (cacheResult.data && cacheResult.data.length > 0) {
        console.log(`✅ [SECURE-DATA] ${cacheResult.data.length} entradas da etapa ${etapaOsId} encontradas no cache`);
        return { entradas: cacheResult.data, fromCache: true };
      }

      // Buscar no arquivo geral de entradas
      const allEntradasResult = await this.getData<OfflineEntradaDados>('ENTRADAS_DADOS');
      
      if (allEntradasResult.data) {
        const entradasFiltradas = allEntradasResult.data.filter(entrada => 
          entrada.etapa_os_id === etapaOsId
        );
        
        if (entradasFiltradas.length > 0) {
          // Salvar cache para próxima busca
          await this.saveData('CACHE_ENTRADAS', entradasFiltradas, `cache_entradas_etapa_${etapaOsId}`);
          
          console.log(`✅ [SECURE-DATA] ${entradasFiltradas.length} entradas da etapa ${etapaOsId} encontradas (e cacheadas)`);
          return { entradas: entradasFiltradas, fromCache: false };
        }
      }

      // Fallback: entrada genérica para foto
      console.log(`⚠️ [SECURE-DATA] Usando entrada genérica para etapa ${etapaOsId}`);
      return {
        entradas: [
          {
            id: 999000 + etapaOsId,
            etapa_os_id: etapaOsId,
            ordem_entrada: 1,
            titulo: 'Foto da Etapa',
            obrigatorio: 1,
            tipo_campo: 'foto'
          }
        ],
        fromCache: false
      };

    } catch (error) {
      console.error(`💥 [SECURE-DATA] Erro ao buscar entradas da etapa ${etapaOsId}:`, error);
      return {
        entradas: [],
        fromCache: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * MARCAR DADOS COMO NÃO FRESCOS (ANTIGOS)
   */
  async markAsStale(dataType: DataType): Promise<void> {
    try {
      const allMetadata = await this.getAllMetadata();
      
      for (const [dataId, metadata] of Object.entries(allMetadata)) {
        if (metadata.dataType === dataType) {
          metadata.fresh = false;
          await this.saveMetadata(dataId, metadata);
        }
      }
      
      console.log(`📅 [SECURE-DATA] ${dataType} marcado como não fresco`);
    } catch (error) {
      console.error('❌ Erro ao marcar dados como antigos:', error);
    }
  }

  /**
   * LIMPEZA DE DADOS ANTIGOS
   */
  async cleanupOldData(daysOld: number = 7): Promise<number> {
    try {
      const allMetadata = await this.getAllMetadata();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      let cleanedCount = 0;
      
      for (const [dataId, metadata] of Object.entries(allMetadata)) {
        const dataDate = new Date(metadata.timestamp);
        
        if (dataDate < cutoffDate && !metadata.fresh) {
          // Remover arquivos
          try {
            await FileSystem.deleteAsync(metadata.secureFilePath, { idempotent: true });
            if (metadata.backupFilePath) {
              await FileSystem.deleteAsync(metadata.backupFilePath, { idempotent: true });
            }
            
            // Remover metadata
            await this.removeMetadata(dataId);
            cleanedCount++;
            
            console.log(`🧹 [SECURE-DATA] Removido: ${dataId}`);
          } catch (deleteError) {
            console.warn(`⚠️ Erro ao remover ${dataId}:`, deleteError);
          }
        }
      }
      
      console.log(`🧹 [SECURE-DATA] ${cleanedCount} arquivos antigos removidos`);
      return cleanedCount;
      
    } catch (error) {
      console.error('❌ Erro na limpeza de dados antigos:', error);
      return 0;
    }
  }

  /**
   * DIAGNÓSTICO DO SISTEMA
   */
  async getDiagnostics(): Promise<{
    totalFiles: number;
    totalSize: number;
    dataTypes: { [key in DataType]?: number };
    storageHealth: 'good' | 'warning' | 'critical';
    recommendations: string[];
  }> {
    
    try {
      const allMetadata = await this.getAllMetadata();
      const dataTypes: { [key in DataType]?: number } = {};
      let totalSize = 0;
      
      for (const metadata of Object.values(allMetadata)) {
        dataTypes[metadata.dataType] = (dataTypes[metadata.dataType] || 0) + 1;
        totalSize += metadata.size;
      }
      
      const totalFiles = Object.keys(allMetadata).length;
      const totalSizeMB = totalSize / (1024 * 1024);
      
      let storageHealth: 'good' | 'warning' | 'critical' = 'good';
      const recommendations: string[] = [];
      
      if (totalSizeMB > 50) {
        storageHealth = 'warning';
        recommendations.push('⚠️ Dados ocupam mais de 50MB - considere limpeza');
      }
      
      if (totalSizeMB > 100) {
        storageHealth = 'critical';
        recommendations.push('❌ CRÍTICO: Dados ocupam mais de 100MB');
      }
      
      if (totalFiles > 100) {
        recommendations.push('🧹 Muitos arquivos - executar limpeza automática');
      }
      
      if (recommendations.length === 0) {
        recommendations.push('✅ Sistema de dados funcionando perfeitamente');
      }
      
      return {
        totalFiles,
        totalSize,
        dataTypes,
        storageHealth,
        recommendations
      };
      
    } catch (error) {
      console.error('❌ Erro no diagnóstico:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        dataTypes: {},
        storageHealth: 'critical',
        recommendations: ['❌ Erro no diagnóstico do sistema']
      };
    }
  }

  // MÉTODOS PRIVADOS DE METADATA (usando AsyncStorage apenas para índice)
  
  private async saveMetadata(dataId: string, metadata: DataFileMetadata): Promise<void> {
    try {
      const allMetadata = await this.getAllMetadata();
      allMetadata[dataId] = metadata;
      await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));
    } catch (error) {
      console.error('❌ Erro ao salvar metadata:', error);
    }
  }

  private async getMetadata(dataId: string): Promise<DataFileMetadata | null> {
    try {
      const allMetadata = await this.getAllMetadata();
      return allMetadata[dataId] || null;
    } catch (error) {
      console.error('❌ Erro ao buscar metadata:', error);
      return null;
    }
  }

  private async removeMetadata(dataId: string): Promise<void> {
    try {
      const allMetadata = await this.getAllMetadata();
      delete allMetadata[dataId];
      await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(allMetadata));
    } catch (error) {
      console.error('❌ Erro ao remover metadata:', error);
    }
  }

  async getAllMetadata(): Promise<DataMetadataStorage> {
    try {
      const metadataStr = await AsyncStorage.getItem(METADATA_KEY);
      return metadataStr ? JSON.parse(metadataStr) : {};
    } catch (error) {
      console.error('❌ Erro ao buscar todo metadata:', error);
      return {};
    }
  }
}

// Singleton export
const secureDataStorage = new SecureDataStorageService();
export default secureDataStorage; 