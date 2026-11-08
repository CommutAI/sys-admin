-- Add severity and anomaly_type columns to fare_irregularities table
ALTER TABLE fare_irregularities
ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS anomaly_type VARCHAR(50) DEFAULT 'count_mismatch';

-- Add comment to describe anomaly types
COMMENT ON COLUMN fare_irregularities.anomaly_type IS 'Type of anomaly: count_mismatch, overcrowding, staff_absence, camera_malfunction, passenger_spike, trip_duration, route_deviation, boarding_rate';

-- Add comment to describe severity levels
COMMENT ON COLUMN fare_irregularities.severity IS 'Severity level: low, medium, high, critical';

-- Add bus_capacity column to buses table if not exists
ALTER TABLE buses
ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 50;

-- Add expected_duration_minutes column to trips table if not exists
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER DEFAULT 60;

-- Add route_id column to trips table if not exists
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES routes(id);

-- Create routes table if not exists
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    start_point VARCHAR(255) NOT NULL,
    end_point VARCHAR(255) NOT NULL,
    expected_duration_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fare_irregularities_anomaly_type ON fare_irregularities(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_fare_irregularities_severity ON fare_irregularities(severity);
CREATE INDEX IF NOT EXISTS idx_trips_route_id ON trips(route_id);
