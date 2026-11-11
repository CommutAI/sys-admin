-- Add video recording column to trips table
-- This stores the URL or path to the recorded video for a trip

DO $$
BEGIN
  -- Add video_recording_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'video_recording_url'
  ) THEN
    ALTER TABLE trips ADD COLUMN video_recording_url TEXT;
    COMMENT ON COLUMN trips.video_recording_url IS 'URL or path to the recorded video file for this trip';
  END IF;

  -- Add video_recording_duration column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'video_recording_duration'
  ) THEN
    ALTER TABLE trips ADD COLUMN video_recording_duration INTEGER;
    COMMENT ON COLUMN trips.video_recording_duration IS 'Duration of the video recording in seconds';
  END IF;

  -- Add video_recording_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'video_recording_status'
  ) THEN
    ALTER TABLE trips ADD COLUMN video_recording_status VARCHAR(20) DEFAULT 'not_recorded';
    COMMENT ON COLUMN trips.video_recording_status IS 'Status of video recording: not_recorded, recording, processing, available, error';
  END IF;

  -- Add video_recording_file_size column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'video_recording_file_size'
  ) THEN
    ALTER TABLE trips ADD COLUMN video_recording_file_size BIGINT;
    COMMENT ON COLUMN trips.video_recording_file_size IS 'Size of the video file in bytes';
  END IF;

  -- Add video_recording_uploaded_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trips' AND column_name = 'video_recording_uploaded_at'
  ) THEN
    ALTER TABLE trips ADD COLUMN video_recording_uploaded_at TIMESTAMPTZ;
    COMMENT ON COLUMN trips.video_recording_uploaded_at IS 'Timestamp when the video was uploaded/processed';
  END IF;

END $$;
