-- Add branch column to staff_users for customer service staff
-- Allows assigning cs_desk users to specific terminals

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff_users' AND column_name = 'branch'
  ) THEN
    ALTER TABLE staff_users ADD COLUMN branch TEXT;
    
    -- Add a check constraint to ensure valid branch values
    ALTER TABLE staff_users ADD CONSTRAINT staff_users_branch_check 
      CHECK (branch IS NULL OR branch IN ('manolo_fortich_terminal', 'agora_terminal'));
  END IF;
END $$;

-- Add comment explaining the branch field
COMMENT ON COLUMN staff_users.branch IS 'Branch assignment for customer service staff: manolo_fortich_terminal or agora_terminal';
