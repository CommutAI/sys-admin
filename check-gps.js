import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iyacktzzktwrpeibcena.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA3MDEzMywiZXhwIjoyMTA2NjQ2MTMzfQ.5-RIUyTvWz5yE6VaqMCD8DRvaLejY8wroJjBCdYiA4A';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupBackendUrl() {
  try {
    const backendUrl = 'http://192.168.1.35:8000'; // Your Windows IP
    
    console.log('Please run this SQL in Supabase SQL Editor to add the backend_url column:');
    console.log(`
ALTER TABLE public.pi_devices ADD COLUMN IF NOT EXISTS backend_url TEXT;
    `);
    console.log('\nThen run this script again to store the backend URL.');
    console.log('\nFor now, please manually set BACKEND_URL in the Raspberry Pi .env file:');
    console.log(`BACKEND_URL=${backendUrl}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

setupBackendUrl();
