const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA3MDEzMywiZXhwIjoyMTA2NjQ2MTMzfQ.5-RIUyTvWz5yE6VaqMCD8DRvaLejY8wroJjBCdYiA4A';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getLatestGPS() {
  try {
    // First, check for GPS from the Pi hardware (source != 'manual')
    const { data: piGPS, error: piError } = await supabase
      .from('gps_locations')
      .select('*')
      .neq('source', 'manual')
      .order('recorded_at', { ascending: false })
      .limit(5);

    if (piGPS && piGPS.length > 0) {
      console.log('Latest GPS coordinates from Raspberry Pi hardware:');
      console.log('==================================================');
      piGPS.forEach((gps, index) => {
        console.log(`\n#${index + 1}`);
        console.log(`Latitude: ${gps.latitude}`);
        console.log(`Longitude: ${gps.longitude}`);
        console.log(`Recorded at: ${gps.recorded_at}`);
        console.log(`Source: ${gps.source}`);
        console.log(`Trip ID: ${gps.trip_id || 'N/A'}`);
        console.log(`Bus ID: ${gps.bus_id || 'N/A'}`);
      });
      process.exit(0);
    }

    // If no Pi GPS, show all recent GPS
    const { data, error } = await supabase
      .from('gps_locations')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching GPS data:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log('No GPS data found in database');
      process.exit(0);
    }

    console.log('Latest GPS coordinates from database:');
    console.log('=====================================');
    console.log('(Note: No GPS data from Raspberry Pi hardware found)');
    data.forEach((gps, index) => {
      console.log(`\n#${index + 1}`);
      console.log(`Latitude: ${gps.latitude}`);
      console.log(`Longitude: ${gps.longitude}`);
      console.log(`Recorded at: ${gps.recorded_at}`);
      console.log(`Source: ${gps.source}`);
      console.log(`Trip ID: ${gps.trip_id || 'N/A'}`);
      console.log(`Bus ID: ${gps.bus_id || 'N/A'}`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getLatestGPS();
