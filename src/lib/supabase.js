import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Regular anon client for most operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client for admin operations (bypasses RLS).
// Uses a separate storage key so it never picks up the browser session
// from the regular anon client — without this, RLS still applies.
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYWpubW9jd3hhcnltZmRhYmp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzkwODI1MywiZXhwIjoyMDk5NDg0MjUzfQ.1Ts4u4EkJmVAudeE97TioarqIW3bYSNlg03HjxJUUig';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,    // ← key fix: don't store/reuse any browser session
    detectSessionInUrl: false,
  },
});
