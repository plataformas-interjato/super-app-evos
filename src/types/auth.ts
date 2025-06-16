import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User } from './workOrder';
import { InitialLoadProgress } from '../services/initialDataService';

export interface LoginFormData {
  email: string;
  password: string;
}

export interface AuthContextType {
  user: SupabaseUser | null;
  session: Session | null;
  appUser: User | null;
  loading: boolean;
  initialLoading: boolean;
  initialProgress: InitialLoadProgress;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
} 