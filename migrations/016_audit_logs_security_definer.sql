-- ============================================================
-- Migration 016: Fix audit_logs RLS + SECURITY DEFINER functions
-- 
-- The admin-only RLS policy blocks all access when the user
-- doesn't have a real Supabase Auth session. This migration:
-- 1. Drops the restrictive admin-only policy
-- 2. Allows any authenticated user to INSERT logs
-- 3. Allows any authenticated user to SELECT logs
-- 4. Creates SECURITY DEFINER RPCs as a fallback for anon access
-- ============================================================

-- Drop the overly restrictive admin-only policy
DROP POLICY IF EXISTS "audit_logs_admin_all" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_rw_authenticated" ON audit_logs;

-- Allow any authenticated user to insert audit logs
CREATE POLICY "audit_logs_insert_authenticated" ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow any authenticated user to read all audit logs
CREATE POLICY "audit_logs_select_authenticated" ON audit_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Also allow anon role to insert (needed when Supabase auth session is unavailable)
CREATE POLICY "audit_logs_insert_anon" ON audit_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anon to read (needed when Supabase auth session is unavailable)
CREATE POLICY "audit_logs_select_anon" ON audit_logs
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- SECURITY DEFINER functions (belt-and-suspenders approach)
-- These bypass RLS entirely, so they work regardless of session state
-- ============================================================

CREATE OR REPLACE FUNCTION insert_audit_log(
  p_username   TEXT,
  p_action     TEXT,
  p_module     TEXT,
  p_details    TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (username, action, module, details, ip_address)
  VALUES (p_username, p_action, p_module, p_details, p_ip_address);
END;
$$;

GRANT EXECUTE ON FUNCTION insert_audit_log(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_audit_logs()
RETURNS SETOF audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM audit_logs ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_audit_logs() TO anon, authenticated;
