-- Remove foreign key constraint from staff_users
-- Users are now managed entirely through staff_users table
-- No dependency on auth.users (avoids email domain restrictions)

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_id_fkey;

-- Update column comment
COMMENT ON COLUMN staff_users.id IS 'User ID - independent from auth.users. Users are managed entirely through the admin panel with no Supabase Auth dependency.';
