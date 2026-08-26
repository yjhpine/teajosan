import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('Supabase 환경변수가 없습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 설정하세요.')
}

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder',
)
