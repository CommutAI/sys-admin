-- Restore foreign key constraint to staff_users
-- This ensures staff_users.id references auth.users.id
-- Users are now created in both tables for full CRUD operations

-- First, drop the constraint if it exists
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_id_fkey;

-- Then add the foreign key constraint
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- Update column comment
COMMENT ON COLUMN staff_users.id IS 'User ID - references auth.users.id. Users are created in both auth.users and staff_users for full authentication and management.';


