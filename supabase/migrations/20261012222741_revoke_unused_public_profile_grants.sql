-- This application uses Supabase for private Storage only. Account and chat
-- tables live in Neon, and these legacy profile tables are not used by the app.
-- Remove unnecessary API grants (including TRUNCATE, which RLS cannot protect).
-- Preserve existing rows, policies and the server service_role permissions.
REVOKE ALL PRIVILEGES ON TABLE public.profiles, public."profiles, Schema: public" FROM anon, authenticated;
