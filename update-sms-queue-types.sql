-- Update SMS queue type constraint to include all needed types
-- Run this in Supabase SQL editor

-- First, drop the existing constraint
ALTER TABLE sms_queue DROP CONSTRAINT IF EXISTS sms_queue_type_check;

-- Add the updated constraint with all types
ALTER TABLE sms_queue
ADD CONSTRAINT sms_queue_type_check
CHECK (type IN ('emergency', 'alighting', 'other', 'admin', 'test', 'reservation_confirmation', 'card_approved', 'card_declined', 'emergency_bus', 'trip_completion', 'topup'));
