-- Create config table for storing configuration values
CREATE TABLE IF NOT EXISTS public.config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

-- Allow all operations (for now)
CREATE POLICY "Config table is public" ON public.config FOR ALL USING (true) WITH CHECK (true);

-- Insert backend URL configuration
INSERT INTO public.config (key, value, updated_at)
VALUES ('backend_url', 'http://192.168.1.35:8000', NOW())
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();
