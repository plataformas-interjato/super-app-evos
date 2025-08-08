import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { AuthContextType } from '../types/auth';
import { User } from '../types/workOrder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { 
  performInitialDataLoad, 
  isInitialSyncCompleted,
  InitialLoadProgress,
  clearInitialCache
} from '../services/initialDataService';
import smartOfflineDataService from '../services/smartOfflineDataService';
import secureDataStorage from '../services/secureDataStorageService';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Função para atualizar dados do usuário globalmente
export const updateAppUser = (updatedUser: Partial<User>) => {
  // Esta função será implementada no provider
  console.log('🔄 updateAppUser chamada:', updatedUser);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Função para atualizar dados do usuário
  const updateUser = (updatedData: Partial<User>) => {
    if (appUser) {
      const updatedUser = { ...appUser, ...updatedData };
      setAppUser(updatedUser);
      console.log('✅ AppUser atualizado:', updatedUser);
    }
  };

  // Função para salvar perfil do usuário no FileSystem
  const saveUserProfile = async (userProfile: User): Promise<void> => {
    try {
      await secureDataStorage.initialize();
      await secureDataStorage.saveData('APP_USER', [userProfile], `user_profile_${userProfile.uuid}`);
      console.log('✅ Perfil do usuário salvo no FileSystem:', {
        id: userProfile.id,
        name: userProfile.name,
        uuid: userProfile.uuid
      });
    } catch (error) {
      console.error('❌ Erro ao salvar perfil no FileSystem:', error);
    }
  };

  // Função para carregar perfil do usuário do FileSystem
  const loadUserProfile = async (userUuid: string): Promise<User | null> => {
    try {
      await secureDataStorage.initialize();
      const result = await secureDataStorage.getData('APP_USER', `user_profile_${userUuid}`);
      
      if (result.data && result.data.length > 0) {
        const profile = result.data[0] as User;
        console.log('✅ Perfil do usuário carregado do FileSystem:', {
          id: profile.id,
          name: profile.name,
          uuid: profile.uuid
        });
        return profile;
      } else {
        console.log('📭 Nenhum perfil encontrado no FileSystem para UUID:', userUuid);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar perfil do FileSystem:', error);
    }
    
    return null;
  };

  // Função para mapear usuário do Supabase para usuário do app
  const mapSupabaseUserToAppUser = async (supabaseUser: SupabaseUser, forceOnline: boolean = false): Promise<User | null> => {
    try {
      console.log('🔄 Mapeando usuário:', supabaseUser.email, 'UUID:', supabaseUser.id);
      
      // PRIMEIRO: Tentar carregar do FileSystem se offline
      if (!forceOnline) {
        const netInfo = await NetInfo.fetch();
        setIsConnected(netInfo.isConnected || false);
        
        if (!netInfo.isConnected) {
          console.log('📱 Offline: Tentando carregar perfil do FileSystem...');
          const cachedProfile = await loadUserProfile(supabaseUser.id);
          if (cachedProfile) {
            console.log('✅ Perfil carregado do FileSystem (offline) - ID:', cachedProfile.id);
            return cachedProfile;
          }
          console.log('⚠️ Perfil não encontrado no FileSystem');
        }
      }

      console.log('🌐 Online: Buscando perfil completo no Supabase...');
      
      // SEGUNDO: Buscar dados do usuário na sua tabela existente usando user_id (ONLINE)
      const { data: userProfile, error } = await supabase
        .from('usuario')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (error) {
        console.log('Erro ao buscar usuário:', error.message);
        
        // Se estiver offline e não encontrou no FileSystem, usar perfil básico
        const netInfo = await NetInfo.fetch();
        if (!netInfo.isConnected) {
          console.log('⚠️ Offline e sem perfil salvo - usando perfil básico temporário');
          return {
            id: '0',
            uuid: supabaseUser.id,
            name: supabaseUser.email?.split('@')[0] || 'Usuário',
            role: 'Técnico',
            userType: 'tecnico' as const,
          };
        }
        
        return null;
      }

      // Mapear a função conforme suas regras de negócio
      const funcao = userProfile.funcao?.toLowerCase();
      const isGestor = funcao === 'supervisor' || funcao === 'gestor';
      
      const getRoleDisplay = (funcao: string) => {
        if (!funcao) return 'Técnico';
        
        switch (funcao.toLowerCase()) {
          case 'supervisor': return 'Supervisor';
          case 'gestor': return 'Gestor';
          case 'tecnico': return 'Técnico';
          default: return funcao.charAt(0).toUpperCase() + funcao.slice(1).toLowerCase();
        }
      };

      const mappedUser = {
        id: userProfile.id.toString(),
        uuid: userProfile.user_id || supabaseUser.id,
        name: userProfile.nome || userProfile.name || supabaseUser.email?.split('@')[0] || 'Usuário',
        role: getRoleDisplay(userProfile.funcao),
        userType: isGestor ? 'gestor' as const : 'tecnico' as const,
        url_foto: userProfile.url_foto,
        funcao_original: userProfile.funcao,
      };

      console.log('✅ Perfil completo obtido do Supabase:', {
        id: mappedUser.id,
        name: mappedUser.name,
        uuid: mappedUser.uuid
      });

      // IMPORTANTE: Salvar perfil no FileSystem para uso offline futuro
      await saveUserProfile(mappedUser);

      return mappedUser;
    } catch (error) {
      console.log('Erro no mapeamento do usuário:', error);
      
      // Em caso de erro, tentar carregar do FileSystem
      const cachedProfile = await loadUserProfile(supabaseUser.id);
      if (cachedProfile) {
        console.log('✅ Usando perfil do FileSystem como fallback');
        return cachedProfile;
      }
      
      return null;
    }
  };

  // Função para executar carga inicial se necessário
  const performInitialLoadIfNeeded = async (userId: string): Promise<void> => {
    try {
      // Verificar se já foi executada
      const completed = await isInitialSyncCompleted(userId);
      if (completed) {
        console.log('✅ Carga inicial já foi executada para este usuário');
        
        // NOVO: Mesmo se a carga inicial já foi feita, garantir que dados FileSystem estejam atualizados
        const netInfo = await NetInfo.fetch();
        if (netInfo.isConnected) {
          try {
            const offlineStatus = await smartOfflineDataService.ensureOfflineDataAvailable();
            
            if (!offlineStatus.available || !offlineStatus.fresh) {
              const downloadResult = await smartOfflineDataService.downloadOfflineData(userId);
              
              if (downloadResult.success) {
                // Dados baixados com sucesso
              }
            }
            
            // Garantir que ordens de serviço estejam no cache
            try {
              const { fetchWorkOrdersWithFilters } = await import('../services/workOrderService');
              const { cacheWorkOrders, getCachedWorkOrders } = await import('../services/workOrderCacheService');
              
              const cacheCheck = await getCachedWorkOrders(userId);
              
              if (!cacheCheck.data || cacheCheck.data.length === 0) {
                const workOrdersResult = await fetchWorkOrdersWithFilters(userId, 'todas', undefined);
                
                if (workOrdersResult.data && !workOrdersResult.error) {
                  await cacheWorkOrders(workOrdersResult.data, userId);
                }
              }
            } catch (workOrderError) {
              // Falha não crítica
            }
            
          } catch (downloadError) {
            // Falha não crítica
          }
        }
        return;
      }

      console.log('🚀 Iniciando carga inicial de dados...');

      // Executar carga inicial
      const result = await performInitialDataLoad(userId);
      
      if (result.success) {
        console.log('✅ Carga inicial concluída com sucesso');
        
        // NOVO: Após carga inicial bem-sucedida, baixar dados para o sistema FileSystem unificado
        const netInfo = await NetInfo.fetch();
        if (netInfo.isConnected) {
          console.log('🌐 Online: Baixando dados para sistema FileSystem unificado...');
          
          try {
            const downloadResult = await smartOfflineDataService.downloadOfflineData(userId);
            
            if (downloadResult.success) {
              console.log('✅ Dados offline baixados para FileSystem com sucesso');
              console.log('📊 Estatísticas:', downloadResult.stats);
            } else {
              console.warn('⚠️ Falha no download dos dados offline:', downloadResult.error);
              console.log('📱 App funcionará apenas online até próxima tentativa');
            }
            
          } catch (downloadError) {
            console.warn('⚠️ Erro no download dos dados offline (não crítico):', downloadError);
          }
        } else {
          console.log('📱 Offline: Download dos dados offline será feito na próxima conexão');
        }
      } else {
        console.error('❌ Falha na carga inicial:', result.error);
      }

      // Em caso de erro, não bloquear o acesso
    } catch (error) {
      console.error('❌ Erro durante carga inicial:', error);
      // Em caso de erro, não bloquear o acesso
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const mappedUser = await mapSupabaseUserToAppUser(session.user);
        setAppUser(mappedUser);
        
        // Executar carga inicial se necessário (apenas para técnicos)
        if (mappedUser && mappedUser.userType === 'tecnico') {
          await performInitialLoadIfNeeded(mappedUser.id);
        }
      }
      
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Forçar busca online em mudanças de auth para atualizar perfil
        const mappedUser = await mapSupabaseUserToAppUser(session.user, true);
        setAppUser(mappedUser);
        
        // Executar carga inicial se necessário (apenas para técnicos)
        if (mappedUser && mappedUser.userType === 'tecnico') {
          await performInitialLoadIfNeeded(mappedUser.id);
        }
      } else {
        setAppUser(null);
        setLoading(false);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listener de conectividade - atualizar quando conexão voltar
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const wasOffline = !isConnected;
      const isNowOnline = state.isConnected || false;
      
      setIsConnected(isNowOnline);
      
      // Se estava offline e agora está online, atualizar perfil
      if (wasOffline && isNowOnline && user) {
        console.log('🌐 Conexão restaurada - atualizando perfil do usuário...');
        try {
          const updatedProfile = await mapSupabaseUserToAppUser(user, true);
          if (updatedProfile) {
            setAppUser(updatedProfile);
            console.log('✅ Perfil atualizado após reconexão');
            
            // Executar carga inicial se necessário
            if (updatedProfile.userType === 'tecnico') {
              await performInitialLoadIfNeeded(updatedProfile.id);
            }
          }
        } catch (error) {
          console.error('❌ Erro ao atualizar perfil após reconexão:', error);
        }
      }
    });

    return () => unsubscribe();
  }, [isConnected, user]);

  // Validação de Funcionalidade: Login do usuário - Validado pelo usuário. Não alterar sem nova validação.
  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        setLoading(false);
        return { error: error.message };
      }
      
      return {};
    } catch (error) {
      setLoading(false);
      return { error: 'Erro inesperado durante o login' };
    }
  };

  const signOut = async () => {
    setLoading(true);
    
    // Limpar cache da carga inicial no logout
    if (appUser) {
      await clearInitialCache(appUser.id);
    }
    
    await supabase.auth.signOut();
    setAppUser(null);
    setLoading(false);
  };

  const value: AuthContextType = {
    user,
    session,
    appUser,
    loading,
    isConnected,
    signIn,
    signOut,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 