// Public by design: the project URL and the publishable (anon-role) key ship in the bundle.
// What they can reach is decided by RLS (owner-only SELECT). Never put service_role or INGEST_KEY here.
export const SUPABASE_URL = 'https://ekyoqpucufzhykuxfajc.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MopfudjjkE4zyonYIoQQmA_JJGjM1VP'

// Country whose movements Inicio shows (PE mode; the US mode arrives in H8).
export const LEDGER_COUNTRY = 'PE'
