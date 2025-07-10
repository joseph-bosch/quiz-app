import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://epdnvsarvkucabnntbws.supabase.co'
export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwZG52c2Fydmt1Y2Fibm50YndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNzE1MjEsImV4cCI6MjA2Njg0NzUyMX0.VHdHbmzfLVW8IXBIGfAHF_-t_eqfhkV2vmWjA2vBK3A'
export const supabase = createClient(supabaseUrl, supabaseKey)
