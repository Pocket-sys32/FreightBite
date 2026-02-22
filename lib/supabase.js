const { createClient } = require('@supabase/supabase-js');
// Do not load dotenv here. server.js loads .env.local and .env from project root first.
// Loading here would use process.cwd() and could override OPENAI_API_KEY or other vars.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
if (!hasSupabaseConfig) {
  // Keep process booting so local SQLite-backed flows can run.
  console.warn('Supabase env vars are missing; Supabase-backed routes will be unavailable.');
}

// Public client (respects RLS policies) when configured
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Service client (bypasses RLS, use server-side only for extraction jobs)
const supabaseAdmin = hasSupabaseConfig && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

module.exports = { supabase, supabaseAdmin };
