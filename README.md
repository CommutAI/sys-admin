# CommutAI System Admin Dashboard

A comprehensive system administration dashboard for the CommutAI public transportation management system, built with React, Vite, and Supabase.

## Features

- **Authentication**: Secure login system with Supabase Auth
- **Dashboard**: Real-time overview of passengers, revenue, trips, and active buses
- **Live Map**: Real-time GPS tracking of all buses with passenger counts
- **User Management**: Manage admin, conductor, and customer service accounts
- **Bus Management**: Manage bus fleet, routes, and maintenance status
- **Trip Management**: Monitor and manage active trips
- **Passenger Analytics**: View passenger count trends and statistics
- **Emergency Alerts**: Real-time emergency alert monitoring
- **Fare Irregularities**: Track and resolve fare-related issues
- **Customer Service**: Manage customer service logs and actions
- **GCash Transactions**: View GCash payment transaction history and statistics
- **Reports**: Generate and export various reports with charts and analytics
- **Audit Logs**: Track all system activities and security events
- **Notifications**: Real-time notification system with database integration

## Tech Stack

- **Frontend**: React 19, Vite 8
- **Styling**: Tailwind CSS v4
- **Maps**: React Leaflet
- **Backend**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime subscriptions
- **Icons**: Lucide React
- **Authentication**: Supabase Auth

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- Supabase account (https://supabase.com)

### 2. Database Setup

1. Create a new project in Supabase Dashboard
2. Go to the SQL Editor in your Supabase project
3. Copy and run the entire contents of `supabase-schema.sql`
4. This will create all tables, enums, functions, triggers, RLS policies, and seed data

### 3. Create Test Users

After running the schema, create test users in the Supabase Dashboard:

1. Go to **Authentication → Users → Add user**
2. Create users with the following credentials:

**Admin User:**
- Email: `admin@commutai.test`
- Password: `Admin123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'System Admin', 'admin@commutai.test', 'admin', true);
  ```

**Conductor User:**
- Email: `conductor@commutai.test`
- Password: `Conductor123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'Test Conductor', 'conductor@commutai.test', 'conductor', true);
  ```

**CS Desk User:**
- Email: `csdesk@commutai.test`
- Password: `CSDesk123!`
- Auto-confirm: Yes
- Copy the user UUID, then run in SQL Editor:
  ```sql
  INSERT INTO staff_users (id, full_name, email, role, is_active)
  VALUES ('<paste-uuid-here>', 'CS Desk Operator', 'csdesk@commutai.test', 'cs_desk', true);
  ```

### 4. Environment Configuration

1. Get your Supabase credentials from the Supabase Dashboard:
   - Project URL: Settings → API → Project URL
   - Anon Key: Settings → API → anon public key

2. Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 5. Install Dependencies

```bash
npm install
```

### 6. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Database Schema

The system uses the following main tables:

- **staff_users**: Staff accounts with roles (admin, conductor, cs_desk)
- **buses**: Bus fleet management with routes and status
- **trips**: Trip records with GPS tracking
- **qr_cards**: QR card management for passengers
- **temporary_tickets**: Temporary ticket issuance
- **transactions**: Financial transactions
- **passenger_counts**: Passenger count snapshots
- **boarded_passengers**: Boarding event records
- **gps_logs**: Historical GPS data
- **fare_irregularities**: Fare compliance tracking
- **emergency_alerts**: Emergency incident management
- **customer_service_logs**: Customer service records
- **gcash_transactions**: GCash payment transaction records
- **notifications**: System notifications and alerts
- **audit_logs**: System activity and security event tracking
- **fare_matrix**: Route fare structure with regular and discounted rates
- **bus_schedules**: Bus assignment to trips across 10-day rotation
- **trip_schedules**: Trip timing with arrival and departure windows

## Row-Level Security

The database implements RLS policies to ensure:
- Admins can see all data
- Conductors can only access their own trips
- All authenticated staff can read buses, QR cards, and transactions
- Each role has appropriate write permissions

## Real-time Features

The following tables are published for real-time updates:
- passenger_counts
- fare_irregularities
- emergency_alerts
- trips
- boarded_passengers

## Building for Production

```bash
npm run build
```

The optimized build will be in the `dist` directory.

## Project Structure

```
track2go-systemadmin/
├── src/
│   ├── components/
│   │   └── Layout.jsx          # Main layout with sidebar
│   ├── lib/
│   │   └── supabase.js         # Supabase client configuration
│   ├── pages/
│   │   ├── Dashboard.jsx       # Main dashboard
│   │   ├── LiveMap.jsx         # GPS tracking map
│   │   ├── ManageUsers.jsx     # User management
│   │   ├── BusManagement.jsx   # Bus fleet management
│   │   └── ...                 # Other pages
│   ├── App.jsx                 # Router configuration
│   └── index.css               # Global styles
├── .env                        # Environment variables
├── supabase-schema.sql         # Database schema
└── package.json
```

## Troubleshooting

### Tailwind CSS Issues

If you encounter Tailwind CSS errors, ensure you have:
- Installed `@tailwindcss/postcss` package
- Updated `postcss.config.js` to use `@tailwindcss/postcss`
- Cleared the Vite cache: `rm -rf node_modules/.vite`

### Supabase Connection Issues

- Verify your `.env` file has the correct URL and key
- Check that your Supabase project is active
- Ensure RLS policies allow the operations you're trying to perform

### Real-time Subscriptions Not Working

- Verify the tables are published in Supabase Realtime
- Check your network connection
- Ensure you're authenticated with Supabase Auth

## License

This project is part of the CommutAI transportation management system.
# sys-admin
