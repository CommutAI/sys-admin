# Database Integration Guide

## Overview
The raspberry-pi-server now integrates with Supabase for persistent storage of passenger count data. This allows for historical analysis and trip tracking.

## Setup Instructions

### 1. Supabase Database Setup

Run the SQL setup script in your Supabase SQL Editor:

```bash
# Copy the contents of supabase_setup.sql and run it in Supabase
```

This creates:
- `passenger_counts` table for storing passenger detection data
- Foreign key relationship to trips table
- Indexes for performance
- Row Level Security (RLS) policies
- `trip_statistics` view for aggregated data

### 2. Environment Configuration

On the Raspberry Pi, create a `.env` file:

```bash
cd ~/bus-monitoring
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
SUPABASE_URL=your-supabase-url-here
SUPABASE_KEY=your-supabase-anon-key-here
```

Get these values from:
- Supabase Dashboard → Project Settings → API
- Project URL and anon/public key

### 3. Install Updated Dependencies

```bash
cd ~/bus-monitoring
pip3 install -r requirements.txt
```

This now includes the `supabase` Python package.

### 4. Update Video Server

The `video_server_fastapi.py` now includes:

- **Database Client**: Automatic Supabase client initialization
- **Trip Association**: Set current trip ID via API endpoint
- **Data Persistence**: Passenger counts saved every 5 seconds
- **API Endpoints**: New endpoints for trip management

### 5. API Endpoints

#### Set Current Trip
```bash
POST /set-trip
Content-Type: application/json

{
  "trip_id": 123
}
```

#### Clear Current Trip
```bash
POST /clear-trip
```

#### Health Check (Updated)
```bash
GET /health
```
Now includes `current_trip_id` in response.

## Usage Workflow

### Starting a Trip with Video Monitoring

1. **Start a trip** in the web application (TripManagement page)
2. **Set the trip ID** in the video server:
   ```bash
   curl -X POST http://raspberry-pi-ip:5000/set-trip \
     -H "Content-Type: application/json" \
     -d '{"trip_id": 123}'
   ```
3. **Start video streaming** from the VideoMonitoring page
4. **Passenger counts** are automatically saved to the database

### Ending a Trip

1. **Clear the trip ID** when trip ends:
   ```bash
   curl -X POST http://raspberry-pi-ip:5000/clear-trip
   ```
2. **End the trip** in the web application

## Trip History Feature

The TripManagement page now includes a comprehensive trip history feature:

### Features

- **Period Selection**: View trips by daily, weekly, monthly, or yearly periods
- **Statistics Dashboard**: Shows:
  - Total trips in period
  - Total passengers transported
  - Average passengers per trip
  - Current period indicator
- **Detailed History**: List of all trips with:
  - Bus information (plate number, route)
  - Conductor details
  - Trip status
  - Timestamps
  - Passenger counts
- **Interactive UI**: Toggle between active trips and history view

### Access

1. Navigate to **Trip Management** page
2. Click **"Trip History"** button
3. Select period (daily/weekly/monthly/yearly)
4. View statistics and detailed trip list

## Database Schema

### passenger_counts Table

```sql
CREATE TABLE passenger_counts (
    id BIGINT PRIMARY KEY,
    trip_id BIGINT NOT NULL,
    count INTEGER NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### trip_statistics View

```sql
CREATE VIEW trip_statistics AS
SELECT 
    trip_id,
    COUNT(*) as total_recordings,
    AVG(count) as average_passengers,
    MAX(count) as max_passengers,
    MIN(count) as min_passengers,
    MIN(recorded_at) as first_recording,
    MAX(recorded_at) as last_recording
FROM passenger_counts
GROUP BY trip_id;
```

## Security Notes

- The video server uses the anon key for database access
- RLS policies restrict access to authenticated users
- Consider using service role key for server-side operations
- Keep `.env` file secure and never commit to version control

## Troubleshooting

### Database Connection Issues

```bash
# Check if credentials are set
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Test connection manually
python3 -c "from supabase import create_client; client = create_client('$SUPABASE_URL', '$SUPABASE_KEY'); print('Connected')"
```

### Passenger Counts Not Saving

1. Check if trip ID is set: `GET /health`
2. Verify database connection in server logs
3. Check Supabase logs for errors
4. Ensure RLS policies allow inserts

### Trip History Not Showing Data

1. Verify passenger_counts table has data
2. Check if trips have associated passenger counts
3. Verify date range filters are working
4. Check browser console for errors

## Performance Considerations

- Passenger counts are saved every 5 seconds to reduce database load
- Consider archiving old data to improve performance
- Use indexes on frequently queried columns
- Monitor Supabase usage limits

## Future Enhancements

- Real-time trip statistics dashboard
- Passenger count trend analysis
- Route optimization based on historical data
- Automated report generation
- Integration with fare calculation system
