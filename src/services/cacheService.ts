import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheItem<T> {
  data: T;
  timestamp: number;
  lastSync: number;
}

export interface CacheConfig {
  ttl: number; // Time to live em milissegundos
  syncInterval: number; // Intervalo de sincronização em milissegundos
}

class CacheService {
  private defaultConfig: CacheConfig = {
    ttl: 5 * 60 * 1000, // 5 minutos
    syncInterval: 2 * 60 * 1000, // 2 minutos
  };

  /**
   * Função simples de hash que funciona em React Native
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Gera chave única para o cache baseada nos parâmetros
   */
  private generateCacheKey(prefix: string, params?: Record<string, any>): string {
    if (!params) return `cache_${prefix}`;
    
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {} as Record<string, any>);
    
    const paramString = JSON.stringify(sortedParams);
    const hash = this.simpleHash(paramString);
    return `cache_${prefix}_${hash}`;
  }

  /**
   * Armazena dados no cache
   */
  async set<T>(
    key: string,
    data: T,
    params?: Record<string, any>,
    config?: Partial<CacheConfig>
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key, params);
      const now = Date.now();
      
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: now,
        lastSync: now,
      };

      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      console.log(`📦 Cache atualizado: ${cacheKey}`);
    } catch (error) {
      console.error('Erro ao salvar no cache:', error);
    }
  }

  /**
   * Recupera dados do cache
   */
  async get<T>(
    key: string,
    params?: Record<string, any>,
    config?: Partial<CacheConfig>
  ): Promise<CacheItem<T> | null> {
    try {
      const cacheKey = this.generateCacheKey(key, params);
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (!cached) {
        console.log(`📦 Cache miss: ${cacheKey}`);
        return null;
      }

      const cacheItem: CacheItem<T> = JSON.parse(cached);
      console.log(`📦 Cache hit: ${cacheKey}`);
      return cacheItem;
    } catch (error) {
      console.error('Erro ao ler do cache:', error);
      return null;
    }
  }

  /**
   * Verifica se o cache está válido (não expirou)
   */
  isValid<T>(cacheItem: CacheItem<T>, config?: Partial<CacheConfig>): boolean {
    const { ttl } = { ...this.defaultConfig, ...config };
    const now = Date.now();
    const isValid = (now - cacheItem.timestamp) < ttl;
    
    console.log(`📦 Cache ${isValid ? 'válido' : 'expirado'} - Idade: ${Math.floor((now - cacheItem.timestamp) / 1000)}s`);
    return isValid;
  }

  /**
   * Verifica se precisa sincronizar com o servidor
   */
  needsSync<T>(cacheItem: CacheItem<T>, config?: Partial<CacheConfig>): boolean {
    const { syncInterval } = { ...this.defaultConfig, ...config };
    const now = Date.now();
    const needsSync = (now - cacheItem.lastSync) >= syncInterval;
    
    console.log(`🔄 ${needsSync ? 'Precisa' : 'Não precisa'} sincronizar - Última sync: ${Math.floor((now - cacheItem.lastSync) / 1000)}s atrás`);
    return needsSync;
  }

  /**
   * Atualiza timestamp da última sincronização
   */
  async updateSyncTimestamp<T>(
    key: string,
    params?: Record<string, any>
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key, params);
      const cached = await AsyncStorage.getItem(cacheKey);
      
      if (cached) {
        const cacheItem: CacheItem<T> = JSON.parse(cached);
        cacheItem.lastSync = Date.now();
        await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheItem));
        console.log(`🔄 Timestamp de sync atualizado: ${cacheKey}`);
      }
    } catch (error) {
      console.error('Erro ao atualizar timestamp de sync:', error);
    }
  }

  /**
   * Remove item específico do cache
   */
  async remove(key: string, params?: Record<string, any>): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key, params);
      await AsyncStorage.removeItem(cacheKey);
      console.log(`🗑️ Cache removido: ${cacheKey}`);
    } catch (error) {
      console.error('Erro ao remover do cache:', error);
    }
  }

  /**
   * Limpa todo o cache (usando prefixo)
   */
  async clearAll(prefix?: string): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => {
        if (prefix) {
          return key.startsWith(`cache_${prefix}`);
        }
        return key.startsWith('cache_');
      });
      
      await AsyncStorage.multiRemove(cacheKeys);
      console.log(`🗑️ Cache limpo: ${cacheKeys.length} itens removidos`);
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
    }
  }

  /**
   * Estratégia de cache com fallback para servidor
   */
  async getWithFallback<T>(
    key: string,
    fetchFunction: () => Promise<{ data: T | null; error: string | null }>,
    params?: Record<string, any>,
    config?: Partial<CacheConfig>
  ): Promise<{ data: T | null; error: string | null; fromCache: boolean }> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    
    try {
      // Tentar buscar do cache primeiro
      const cached = await this.get<T>(key, params, mergedConfig);
      
      if (cached) {
        // Se cache é válido e não precisa sync, retornar do cache
        if (this.isValid(cached, mergedConfig) && !this.needsSync(cached, mergedConfig)) {
          return { data: cached.data, error: null, fromCache: true };
        }
        
        // Se cache existe mas precisa sync, buscar do servidor em background
        if (this.needsSync(cached, mergedConfig)) {
          console.log('🔄 Iniciando sincronização em background...');
          
          // Retornar dados do cache imediatamente
          const cacheResult = { data: cached.data, error: null, fromCache: true };
          
          // Sincronizar em background
          this.syncInBackground(key, fetchFunction, params, mergedConfig);
          
          return cacheResult;
        }
      }
      
      // Se não há cache ou cache expirou, buscar do servidor
      console.log('🌐 Buscando dados do servidor...');
      const result = await fetchFunction();
      
      if (result.data && !result.error) {
        // Salvar no cache
        await this.set(key, result.data, params, mergedConfig);
      }
      
      return { ...result, fromCache: false };
      
    } catch (error) {
      console.error('Erro na estratégia de cache:', error);
      return { data: null, error: 'Erro interno do cache', fromCache: false };
    }
  }

  /**
   * Sincronização em background
   */
  private async syncInBackground<T>(
    key: string,
    fetchFunction: () => Promise<{ data: T | null; error: string | null }>,
    params?: Record<string, any>,
    config?: CacheConfig
  ): Promise<void> {
    try {
      const result = await fetchFunction();
      
      if (result.data && !result.error) {
        await this.set(key, result.data, params, config);
        console.log('✅ Sincronização em background concluída');
      } else {
        // Apenas atualizar timestamp mesmo se houve erro
        await this.updateSyncTimestamp(key, params);
        console.log('⚠️ Erro na sincronização, mantendo cache atual');
      }
    } catch (error) {
      console.error('Erro na sincronização em background:', error);
      // Atualizar timestamp para evitar sync constantes em caso de erro
      await this.updateSyncTimestamp(key, params);
    }
  }
}

export const cacheService = new CacheService(); 