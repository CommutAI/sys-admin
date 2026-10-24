-- Update card_reservations status check constraint to include approved and declined
-- This allows admin to approve or decline card reservations

-- First, drop the existing check constraint
ALTER TABLE card_reservations DROP CONSTRAINT IF EXISTS card_reservations_status_check;

-- Add the updated check constraint with new status values
ALTER TABLE card_reservations
ADD CONSTRAINT card_reservations_status_check
CHECK (status IN ('pending', 'approved', 'declined', 'claimed', 'expired', 'cancelled'));

-- Note: If the constraint name is different, you may need to check the actual constraint name first
-- Run this to see existing constraints:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'card_reservations'::regclass AND contype = 'c';
