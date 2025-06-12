import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { AuthContextType } from '../types/auth';
import { User } from '../types/workOrder';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
          id: supabaseUser.id,
          numericId: undefined,
          name: supabaseUser.email?.split('@')[0] || 'Usuário',
          role: 'Técnico',
          userType: 'tecnico',
        };
      }

      // Mapear a função conforme suas regras de negócio
      const funcao = userProfile.funcao?.toLowerCase();
      const isGestor = funcao === 'supervisor' || funcao === 'gestor';

      return {
        id: userProfile.user_id || supabaseUser.id, // UUID do Supabase Auth
        numericId: userProfile.id, // ID numérico da tabela usuario
        name: userProfile.nome || userProfile.name || supabaseUser.email?.split('@')[0] || 'Usuário',
        role: isGestor ? 'Gestor' : 'Técnico',
        userType: isGestor ? 'gestor' : 'tecnico',
        url_foto: userProfile.url_foto,
      };
    } catch (error) {
      console.log('Erro no mapeamento do usuário:', error);
      return {
        id: supabaseUser.id,
        numericId: undefined,
        name: supabaseUser.email?.split('@')[0] || 'Usuário',
        role: 'Técnico',
        userType: 'tecnico',
      };
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
      } else {
        setAppUser(null);
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 