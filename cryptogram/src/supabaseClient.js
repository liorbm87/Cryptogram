import { createClient } from '@supabase/supabase-js'

// Vite מושך את המשתנים מהקובץ .env באמצעות האובייקט import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)