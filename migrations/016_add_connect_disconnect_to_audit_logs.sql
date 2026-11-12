-- Add CONNECT and DISCONNECT actions to audit_logs action check constraint
-- Run this in your Supabase SQL editor

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_action_check
CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT', 'APPROVE', 'DECLINE', 'CONNECT', 'DISCONNECT'));
