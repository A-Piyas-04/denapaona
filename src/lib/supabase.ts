import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client init — anon key only (§12.1, §12.2).
 *
 * The anon key is an identifier, not a secret; it ships in the bundle by
 * design and grants nothing without RLS.  The service_role key must NEVER
 * appear in this codebase or in any VITE_ variable.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
);
