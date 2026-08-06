# FastAPI Backend Service for CommutAI

A FastAPI backend service that handles complex operations, aggregations, and business logic for the CommutAI transportation management system.

## Features

- **Card Management**: Batch operations, statistics, and activity tracking
- **Transaction Analytics**: Daily revenue, payment reconciliation, and batch processing
- **Advanced Analytics**: Passenger trends, route performance, and bus utilization
- **Report Generation**: Multiple report types with JSON/CSV export
- **Webhook Handling**: GCash, Stripe, and emergency alert webhooks
- **Efficient Aggregations**: Server-side data processing to reduce frontend load

## Architecture

This backend complements the existing Supabase direct access pattern by:
- Handling complex aggregations that would be expensive in the frontend
- Providing batch operations for efficiency
- Centralizing business logic
- Handling external webhook integrations
- Offering caching capabilities (Redis integration ready)

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
REDIS_URL=redis://localhost:6379/0  # Optional
JWT_SECRET_KEY=your-jwt-secret-key  # Optional
```

### 3. Run the Server

```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`

### 4. Access API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Card Management (`/api/cards`)

- `GET /api/cards/stats` - Get card statistics
- `GET /api/cards/summary` - Get card summary with transaction counts
- `POST /api/cards/batch-update` - Batch update multiple cards
- `GET /api/cards/low-balance` - Get cards with low balance
- `GET /api/cards/activity/{card_uid}` - Get card activity history

### Transactions (`/api/transactions`)

- `GET /api/transactions/analytics/daily` - Daily revenue breakdown
- `GET /api/transactions/analytics/summary` - Transaction analytics summary
- `POST /api/transactions/batch` - Create batch transactions
- `GET /api/transactions/reconciliation` - Payment reconciliation

### Analytics (`/api/analytics`)

- `GET /api/analytics/passenger-trends` - Passenger count trends
- `GET /api/analytics/route-performance` - Route performance metrics
- `GET /api/analytics/realtime-dashboard` - Real-time dashboard data
- `GET /api/analytics/bus-utilization` - Bus utilization metrics

### Reports (`/api/reports`)

- `POST /api/reports/generate` - Generate various reports
- `GET /api/reports/scheduled` - List available report types
- `GET /api/reports/export/{report_id}` - Export report (JSON/CSV)

### Webhooks (`/api/webhooks`)

- `POST /api/webhooks/gcash` - GCash payment webhooks
- `POST /api/webhooks/stripe` - Stripe payment webhooks
- `POST /api/webhooks/emergency` - Emergency alert webhooks

## Integration with Frontend

### Example: Using Card Stats API

Instead of fetching all cards in the frontend:

```javascript
// Old approach (direct Supabase)
const { data } = await supabase.from('qr_cards').select('*');
const active = data.filter(c => c.status === 'active').length;

// New approach (FastAPI backend)
const response = await fetch('http://localhost:8000/api/cards/stats');
const stats = await response.json();
// stats.active_cards, stats.total_balance, etc.
```

### Example: Real-time Dashboard

Replace multiple Supabase queries with single API call:

```javascript
// Old approach
const trips = await supabase.from('trips').select('*').eq('status', 'active');
const counts = await supabase.from('passenger_counts').select('*');
const transactions = await supabase.from('transactions').select('*');
// ... more queries

// New approach
const response = await fetch('http://localhost:8000/api/analytics/realtime-dashboard');
const dashboard = await response.json();
// All data in one request
```

## Performance Benefits

1. **Reduced Frontend Queries**: Multiple Supabase calls → Single API call
2. **Server-side Aggregation**: Complex calculations done on backend
3. **Batch Operations**: Efficient bulk updates
4. **Caching Ready**: Redis integration for frequently accessed data
5. **Async Processing**: FastAPI's async support for concurrent requests

## Raspberry Pi Video Server Migration

The Flask video server has been migrated to FastAPI for better performance:

### New FastAPI Video Server

- **File**: `raspberry-pi-server/video_server_fastapi.py`
- **Benefits**: Async support, better performance, automatic API docs
- **WebSocket**: Native WebSocket support via FastAPI
- **Compatibility**: Maintains same functionality as Flask version

### Migration Steps

1. Install new dependencies:
```bash
cd raspberry-pi-server
pip install -r requirements.txt  # Updated with FastAPI
```

2. Run the new server:
```bash
python video_server_fastapi.py
```

3. Update frontend WebSocket connection:
```javascript
// Old: Socket.IO client
const socket = io('http://raspberry-pi:5000');

// New: Native WebSocket
const ws = new WebSocket('ws://raspberry-pi:5000/ws');
ws.send(JSON.stringify({ action: 'start_stream' }));
```

## Deployment

### Production Setup

1. Use environment variables for configuration
2. Enable HTTPS (use nginx reverse proxy)
3. Implement proper authentication
4. Set up Redis for caching
5. Configure rate limiting
6. Enable CORS for your frontend domain

### Docker Deployment (Optional)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Monitoring

- Health check: `GET /health`
- API metrics available via `/docs`
- Add logging for production monitoring

## Security Notes

- Service role key should be kept secret
- Implement proper authentication for production
- Use HTTPS in production
- Validate all webhook signatures
- Implement rate limiting

## Troubleshooting

### Connection Issues
- Verify Supabase credentials in `.env`
- Check network connectivity
- Ensure CORS is configured correctly

### Performance Issues
- Enable Redis caching
- Add database indexes
- Implement pagination for large datasets

### Webhook Failures
- Verify webhook signatures
- Check provider status
- Review error logs

## Development

### Adding New Endpoints

1. Create a new router in `routers/`
2. Import and include in `main.py`
3. Add Pydantic models for request/response
4. Add error handling
5. Update this README

### Testing

```bash
# Install test dependencies
pip install pytest httpx

# Run tests
pytest
```

## License

Part of the CommutAI transportation management system.
