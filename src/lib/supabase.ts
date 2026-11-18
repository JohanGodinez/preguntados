import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null

export const MISSING_CONFIG_ERROR =
  'Falta configurar Supabase: definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local'
