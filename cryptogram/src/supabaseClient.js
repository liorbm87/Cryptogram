import { createClient } from '@supabase/supabase-js'



const supabaseUrl = 'https://nxugbbhdmicyfzrxamdc.supabase.co'

const supabaseKey = 'sb_publishable_gz3Ar69rITTjNn5L96Uctw_cW4n9B5m'



export const supabase = createClient(supabaseUrl, supabaseKey)