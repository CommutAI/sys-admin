-- Remove foreign key constraint from staff_users to allow independent user creation
-- This allows creating staff users without requiring auth.users records
--
-- Design Decision:
-- - Users created via admin panel exist in staff_users table but NOT in auth.users
-- - This is intentional for local user management without Supabase Auth
-- - These users are managed entirely through the admin interface
-- - They do not have password-based authentication via Supabase

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_id_fkey;

-- Optionally: Add a comment explaining this decision
COMMENT ON COLUMN staff_users.id IS 'User ID - can be independent from auth.users for local user management. Users created via admin panel exist in staff_users but not in auth.users.';

