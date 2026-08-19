# FastAPI Integration Guide

This guide explains how to integrate the new FastAPI backend services with your existing React frontend.

## Overview

Your system now has two FastAPI services:

1. **Video Server** (`raspberry-pi-server/video_server_fastapi.py`) - For Raspberry Pi video monitoring
2. **Backend API** (`backend/main.py`) - For complex operations and aggregations

## Architecture

```
┌─────────────────┐
│  React Frontend │
│   (Vite + React)│
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────┐
│ Supabase│ │ FastAPI  │
│ (Direct)│ │ Backend  │
└─────────┘ └──────────┘
                  │
            ┌─────┴─────┐
            │           │
            ▼           ▼
    ┌──────────┐ ┌──────────────┐
    │ Supabase │ │ Video Server │
    │ (Admin)  │ │ (Raspberry Pi)│
    └──────────┘ └──────────────┘
```

## Integration Strategy

### Keep Direct Supabase For:
- Simple CRUD operations
- Real-time subscriptions
- Authentication
- Single record fetches

### Use FastAPI Backend For:
- Complex aggregations
- Batch operations
- Report generation
- Webhook handling
- Analytics and statistics

## Step-by-Step Integration

### 1. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```env
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Start the Backend Server

```bash
cd backend
python main.py
```

Backend will run on `http://localhost:8000`

### 4. Update Frontend API Calls

#### Example: Card Management

**Before (Direct Supabase):**
```javascript
// src/pages/CardManagement.jsx
const fetchQrCards = async () => {
  const { data, error } = await supabase
    .from('qr_cards')
    .select('*, issuer:staff_users!issued_by(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  setQrCards(data || []);
};
```

**After (FastAPI for stats, Supabase for data):**
```javascript
// src/pages/CardManagement.jsx
const fetchCardStats = async () => {
  const response = await fetch('http://localhost:8000/api/cards/stats');
  const stats = await response.json();
  setCardStats(stats);
};

const fetchQrCards = async () => {
  // Keep direct Supabase for data fetching
  const { data, error } = await supabase
    .from('qr_cards')
    .select('*, issuer:staff_users!issued_by(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  setQrCards(data || []);
};
```

#### Example: Dashboard Analytics

**Before (Multiple Supabase calls):**
```javascript
// src/pages/Dashboard.jsx
const fetchDashboardData = async () => {
  const [trips, counts, transactions] = await Promise.all([
    supabase.from('trips').select('*').eq('status', 'active'),
    supabase.from('passenger_counts').select('*').order('created_at', desc=True).limit(100),
    supabase.from('transactions').select('*').gte('created_at', today)
  ]);
  // Process data...
};
```

**After (Single FastAPI call):**
```javascript
// src/pages/Dashboard.jsx
const fetchDashboardData = async () => {
  const response = await fetch('http://localhost:8000/api/analytics/realtime-dashboard');
  const dashboard = await response.json();
  setActiveBuses(dashboard.active_buses);
  setTotalPassengers(dashboard.total_passengers);
  setTodayRevenue(dashboard.today_revenue);
  // All data in one request!
};
```

### 5. Update Video Monitoring WebSocket

**Before (Socket.IO):**
```javascript
// src/pages/VideoMonitoring.jsx
import { io } from 'socket.io-client';

const socket = io('http://raspberry-pi:5000');

socket.on('connect', () => {
  console.log('Connected to video server');
});

socket.on('video_frame', (data) => {
  setFrame(data.frame);
});

socket.emit('start_stream');
```

**After (Native WebSocket):**
```javascript
// src/pages/VideoMonitoring.jsx
const ws = new WebSocket('ws://raspberry-pi:5000/ws');

ws.onopen = () => {
  console.log('Connected to video server');
  ws.send(JSON.stringify({ action: 'start_stream' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.video_frame) {
    setFrame(data.video_frame);
  } else if (data.count !== undefined) {
    setPassengerCount(data.count);
  }
};
```

### 6. Create API Helper Functions

Create `src/lib/api.js`:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = {
  // Card Management
  getCardStats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/cards/stats`);
    return response.json();
  },

  getCardSalesStats: async () => {
    const response = await fetch(`${API_BASE_URL}/api/cards/sales-stats`);
    return response.json();
  },
  
  getCardSummary: async (params = {}) => {
    const url = new URL(`${API_BASE_URL}/api/cards/summary`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url);
    return response.json();
  },
  
  // Analytics
  getPassengerTrends: async (startDate, endDate, groupBy = 'day') => {
    const response = await fetch(
      `${API_BASE_URL}/api/analytics/passenger-trends?start_date=${startDate}&end_date=${endDate}&group_by=${groupBy}`
    );
    return response.json();
  },
  
  getRealtimeDashboard: async () => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/realtime-dashboard`);
    return response.json();
  },
  
  // Reports
  generateReport: async (reportType, startDate, endDate) => {
    const response = await fetch(`${API_BASE_URL}/api/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report_type: reportType,
        start_date: startDate,
        end_date: endDate
      })
    });
    return response.json();
  },
  
  // Transactions
  getDailyRevenue: async (startDate, endDate) => {
    const response = await fetch(
      `${API_BASE_URL}/api/transactions/analytics/daily?start_date=${startDate}&end_date=${endDate}`
    );
    return response.json();
  }
};
```

### 7. Update Environment Variables

Add to your frontend `.env`:
```env
VITE_API_URL=http://localhost:8000
VITE_VIDEO_SERVER_URL=ws://raspberry-pi:5000/ws
```

## Migration Checklist

- [ ] Install backend dependencies
- [ ] Configure backend environment variables
- [ ] Start backend server
- [ ] Update video server to FastAPI version
- [ ] Create API helper functions
- [ ] Update frontend API calls (gradually)
- [ ] Test new endpoints
- [ ] Update WebSocket connections
- [ ] Remove Socket.IO dependency (if no longer needed)
- [ ] Update documentation

## Performance Improvements

### Before:
- 5-10 Supabase calls per page load
- Client-side aggregations
- Multiple WebSocket connections

### After:
- 1-2 API calls per page load
- Server-side aggregations
- Native WebSocket (lighter)

**Expected improvement**: 40-60% faster page loads, reduced bandwidth usage

## Testing

### Test Backend API

```bash
# Health check
curl http://localhost:8000/health

# Get card stats
curl http://localhost:8000/api/cards/stats

# Get dashboard data
curl http://localhost:8000/api/analytics/realtime-dashboard
```

### Test Video Server

```bash
# Health check
curl http://raspberry-pi:5000/health

# Test WebSocket connection
wscat -c ws://raspberry-pi:5000/ws
```

## Troubleshooting

### Backend won't start
- Check Python version (3.9+)
- Verify dependencies installed
- Check `.env` file exists and is configured

### API calls failing
- Verify backend is running on port 8000
- Check CORS configuration
- Verify Supabase credentials

### WebSocket connection issues
- Check video server is running
- Verify WebSocket URL
- Check network connectivity

## Production Considerations

1. **Environment Variables**: Use production credentials
2. **CORS**: Restrict to your frontend domain
3. **Authentication**: Add JWT authentication to FastAPI
4. **Rate Limiting**: Implement rate limiting
5. **HTTPS**: Use reverse proxy (nginx)
6. **Caching**: Enable Redis for frequently accessed data
7. **Monitoring**: Add logging and monitoring

## Rollback Plan

If issues arise, you can rollback by:
1. Stop FastAPI backend
2. Revert frontend API calls to direct Supabase
3. Use Flask video server instead of FastAPI version
4. Remove API helper functions

## Support

For issues:
- Backend API: Check `backend/README.md`
- Video Server: Check `raspberry-pi-server/README.md`
- FastAPI Docs: https://fastapi.tiangolo.com/
