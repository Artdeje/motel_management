import { createClient } from '@supabase/supabase-js';

// Optional direct Supabase client for realtime / storage / dynamic data beyond the Express API.
// Works with either anon key or publishable key (new Supabase format).
// If env vars are missing, the client is null and the app falls back to /api (Express) for all data.

const url =
  import.meta.env.VITE_SUPABASE_URL as string | undefined;

const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const isSupabaseConfigured = !!supabase;

// Helper for future dynamic Supabase queries (e.g., realtime subscriptions)
// Example: supabase?.channel('orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, cb).subscribe()
