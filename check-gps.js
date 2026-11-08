import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-project-url';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';

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
