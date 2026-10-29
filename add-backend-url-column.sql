-- Add backend_url column to pi_devices table
ALTER TABLE public.pi_devices ADD COLUMN IF NOT EXISTS backend_url TEXT;
