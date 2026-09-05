import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYWpubW9jd3hhcnltZmRhYmp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzkwODI1MywiZXhwIjoyMDk5NDg0MjUzfQ.1Ts4u4EkJmVAudeE97TioarqIW3bYSNlg03HjxJUUig';

// Regular anon client for most operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: 'sb-anon' },
});

// Service role client for admin operations (bypasses RLS).
// Uses a distinct storageKey so it never shares session storage with the anon client,
// which eliminates the "Multiple GoTrueClient instances" warning.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    storageKey: 'sb-admin',
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
