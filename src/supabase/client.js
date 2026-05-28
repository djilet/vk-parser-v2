import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

export function getSupabaseSchema() {
  return config.supabase.schema;
}

export function isSupabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return client;
}
