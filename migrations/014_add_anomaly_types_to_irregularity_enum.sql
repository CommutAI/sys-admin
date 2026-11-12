-- Add new anomaly types to irregularity_type enum
-- This adds the types used by the enhanced anomaly detection system

DO $$
BEGIN
  -- Add new anomaly types to the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'overcrowding'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'overcrowding';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'staff_absence'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'staff_absence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'camera_malfunction'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'camera_malfunction';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'passenger_spike'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'passenger_spike';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'trip_duration'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'trip_duration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'route_deviation'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'route_deviation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'boarding_rate'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'irregularity_type')
  ) THEN
    ALTER TYPE irregularity_type ADD VALUE 'boarding_rate';
  END IF;
END $$;

-- Update comment to reflect all available types
COMMENT ON TYPE irregularity_type IS 'Types of fare irregularities: double_scan, count_mismatch, fare_evasion, hardware_error, other, overcrowding, staff_absence, camera_malfunction, passenger_spike, trip_duration, route_deviation, boarding_rate';
