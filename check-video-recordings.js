import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iyacktzzktwrpeibcena.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTA3MDEzMywiZXhwIjoyMTA2NjQ2MTMzfQ.5-RIUyTvWz5yE6VaqMCD8DRvaLejY8wroJjBCdYiA4A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVideoRecordings() {
  console.log('Checking trips table for video recordings...\n');

  // Check trips with video recording
  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('id, video_recording_status, video_recording_url, video_recording_duration, video_recording_file_size, video_recording_uploaded_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (tripsError) {
    console.error('Error fetching trips:', tripsError);
    return;
  }

  console.log('=== TRIPS TABLE ===');
  trips.forEach(trip => {
    console.log(`Trip ID: ${trip.id}`);
    console.log(`  Status: ${trip.video_recording_status}`);
    console.log(`  URL: ${trip.video_recording_url}`);
    console.log(`  Duration: ${trip.video_recording_duration}s`);
    console.log(`  File Size: ${trip.video_recording_file_size} bytes`);
    console.log(`  Uploaded At: ${trip.video_recording_uploaded_at}`);
    console.log('');
  });

  console.log('\n=== VIDEO_RECORDINGS TABLE ===');
  const { data: recordings, error: recordingsError } = await supabase
    .from('video_recordings')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(10);

  if (recordingsError) {
    console.error('Error fetching recordings:', recordingsError);
    return;
  }

  recordings.forEach(rec => {
    console.log(`Recording ID: ${rec.id}`);
    console.log(`  Trip ID: ${rec.trip_id}`);
    console.log(`  File Name: ${rec.file_name}`);
    console.log(`  File Path: ${rec.file_path}`);
    console.log(`  File Size: ${rec.file_size} bytes`);
    console.log(`  Duration: ${rec.duration}s`);
    console.log(`  Status: ${rec.status}`);
    console.log(`  Source: ${rec.metadata?.source}`);
    console.log('');
  });
}

checkVideoRecordings();
