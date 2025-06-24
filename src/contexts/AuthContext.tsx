import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { AuthContextType } from '../types/auth';
import { User } from '../types/workOrder';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  performInitialDataLoad, 
  isInitialSyncCompleted,
  InitialLoadProgress,
  clearInitialCache
} from '../services/initialDataService';

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

  // Função para atualizar dados do usuário
  const updateUser = (updatedData: Partial<User>) => {
    if (appUser) {
      const updatedUser = { ...appUser, ...updatedData };
      setAppUser(updatedUser);
      console.log('✅ AppUser atualizado:', updatedUser);
    }
  };

  // Função para mapear usuário do Supabase para usuário do app
  const mapSupabaseUserToAppUser = async (supabaseUser: SupabaseUser): Promise<User | null> => {
    try {
      // Buscar dados do usuário na sua tabela existente usando user_id
      const { data: userProfile, error } = await supabase
        .from('usuario')
        .select('*')
        .eq('user_id', supabaseUser.id)
        .single();

      if (error) {
        console.log('Erro ao buscar usuário:', error.message);
        console.log('Usuário não encontrado na tabela usuario com user_id:', supabaseUser.id);
        
        // Criar usuário padrão se não encontrar
        return {
          id: '0', // ID padrão para erros
          uuid: supabaseUser.id, // UUID como referência
          name: supabaseUser.email?.split('@')[0] || 'Usuário',
          role: 'Técnico',
          userType: 'tecnico',
        };
      }

      // Mapear a função conforme suas regras de negócio - mantendo cargo real
      const funcao = userProfile.funcao?.toLowerCase();
      const isGestor = funcao === 'supervisor' || funcao === 'gestor';
      
      // Função para obter o cargo para exibição
      const getRoleDisplay = (funcao: string) => {
        if (!funcao) return 'Técnico';
        
        switch (funcao.toLowerCase()) {
          case 'supervisor': return 'Supervisor';
          case 'gestor': return 'Gestor';
          case 'tecnico': return 'Técnico';
          default: return funcao.charAt(0).toUpperCase() + funcao.slice(1).toLowerCase();
        }
      };

      return {
        id: userProfile.id.toString(), // ID numérico como ID principal
        uuid: userProfile.user_id || supabaseUser.id, // UUID como referência
        name: userProfile.nome || userProfile.name || supabaseUser.email?.split('@')[0] || 'Usuário',
        role: getRoleDisplay(userProfile.funcao), // Cargo real da tabela
        userType: isGestor ? 'gestor' : 'tecnico', // Tipo para lógica interna (supervisor = gestor para permissões)
        url_foto: userProfile.url_foto,
        funcao_original: userProfile.funcao, // Manter função original para referência
      };
    } catch (error) {
      console.log('Erro no mapeamento do usuário:', error);
      return {
        id: '0',
        uuid: supabaseUser.id,
        name: supabaseUser.email?.split('@')[0] || 'Usuário',
        role: 'Técnico',
        userType: 'tecnico',
      };
    }
  };

  /**
   * Executa carga inicial de dados se necessário
   */
  const performInitialLoadIfNeeded = async (userId: string): Promise<void> => {
    try {
      // Verificar se já foi executada
      const isCompleted = await isInitialSyncCompleted(userId);
      
      if (isCompleted) {
        console.log('✅ Carga inicial já executada para este usuário');
        return;
      }

      console.log('🚀 Iniciando carga inicial de dados...');

      // Executar carga inicial com callback de progresso
      const result = await performInitialDataLoad(userId, (progress) => {
        // Progress callback is not used in the new implementation
      });

      if (result.success && result.stats) {
        console.log('🎉 Carga inicial concluída:', result.stats);
      } else {
        console.error('❌ Erro na carga inicial:', result.error);
        // Em caso de erro, não bloquear o acesso
      }

    } catch (error) {
      console.error('💥 Erro inesperado na carga inicial:', error);
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
        const mappedUser = await mapSupabaseUserToAppUser(session.user);
        setAppUser(mappedUser);
        
        // Executar carga inicial se necessário (apenas para técnicos)
        if (mappedUser && mappedUser.userType === 'tecnico') {
          await performInitialLoadIfNeeded(mappedUser.id);
        }
      } else {
        setAppUser(null);
        // Limpar dados de carga inicial no logout
        setLoading(false);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    signIn,
    signOut,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 