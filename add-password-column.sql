-- Add password column to staff_users table
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS password TEXT;

-- Add comment
COMMENT ON COLUMN staff_users.password IS 'User password (plain text for now - TODO: implement hashing)';
