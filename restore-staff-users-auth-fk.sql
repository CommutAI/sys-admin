-- Remove foreign key constraint from staff_users
-- Users can exist in staff_users without auth.users (for email domain restrictions)
-- When auth.users creation succeeds, both tables will have the user
-- When it fails (email domain restriction), only staff_users has the user

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_id_fkey;

-- Update column comment
COMMENT ON COLUMN staff_users.id IS 'User ID - can be independent from auth.users. Users are created in auth.users when possible, but can exist in staff_users only if email domain restrictions apply.';
