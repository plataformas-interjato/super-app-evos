import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Cole aqui as suas credenciais do Supabase
// Você pode encontrá-las no painel do Supabase em Settings > API
const supabaseUrl = "https://vpojiweakxijsuqlupio.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwb2ppd2Vha3hpanN1cWx1cGlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk3NzA0MjMsImV4cCI6MjA0NTM0NjQyM30.DVI10fDhc-tpdwhIkXIRkLjcj1UYXuSLsFKZ6qI7hKQ"

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}) 