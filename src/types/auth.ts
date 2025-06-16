import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User } from './workOrder';

export interface LoginFormData {
  email: string;
  password: string;
}

export interface AuthContextType {
  user: SupabaseUser | null;
  session: Session | null;
  appUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
} 