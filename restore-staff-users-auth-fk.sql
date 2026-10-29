-- Restore foreign key constraint to staff_users
-- This ensures staff_users.id references auth.users.id
-- Users are created in both auth.users and staff_users for cross-system authentication

-- Step 1: First, fix any orphaned staff_users records (no matching auth.users)
-- This creates auth.users for existing staff users so the constraint can be added
DO $$
DECLARE
  staff_record RECORD;
  temp_password TEXT;
BEGIN
  -- Enable pgcrypto extension if not already enabled
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  FOR staff_record IN SELECT id, email, full_name, role FROM staff_users WHERE id NOT IN (SELECT id FROM auth.users)
  LOOP
    -- Generate a temporary password (users should reset this)
    temp_password := encode(gen_random_bytes(16), 'hex');

    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
    VALUES (
      staff_record.id,
      staff_record.email,
      crypt(temp_password, gen_salt('bf')),
      NOW(),
      jsonb_build_object('full_name', staff_record.full_name, 'role', staff_record.role),
      NOW(),
      NOW()
    );
    RAISE NOTICE 'Created auth user for: % (temp password: %)', staff_record.email, temp_password;
  END LOOP;
END $$;

-- Step 2: Verify no orphaned records remain
SELECT id, email, full_name, role
FROM staff_users
WHERE id NOT IN (SELECT id FROM auth.users);

-- Step 3: Drop the existing constraint if it exists
ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_id_fkey;

-- Step 4: Add the foreign key constraint
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- Step 5: Update column comment
COMMENT ON COLUMN staff_users.id IS 'User ID - references auth.users.id. Users are created in both auth.users and staff_users for cross-system authentication.';
