-- Add decline_reason column to card_reservations table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'card_reservations' AND column_name = 'decline_reason'
    ) THEN
        ALTER TABLE card_reservations ADD COLUMN decline_reason TEXT;
    END IF;
END $$;
