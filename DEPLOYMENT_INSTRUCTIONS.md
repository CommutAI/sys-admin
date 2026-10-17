# Deployment Instructions - Security Fixes Applied

## Critical Security Fixes Applied

### 1. ✅ Removed Hardcoded Service Role Key
- **File**: `src/lib/supabase.js`
- **Change**: Removed hardcoded service role key that was exposed in client bundle
- **Impact**: Prevents any user from bypassing RLS via exposed credentials

### 2. ✅ Replaced supabaseAdmin with Anon Client
- **Files**: All frontend pages (Dashboard, ManageUsers, TripManagement, CardManagement, Reports)
- **Change**: Replaced `supabaseAdmin` (service role) with `supabase` (anon key)
- **Impact**: All database operations now respect RLS policies

### 3. ✅ Moved Admin Operations to Backend API
- **New File**: `backend/routers/emergency_alerts.py`
- **Change**: Emergency alert acknowledge/resolve moved to authenticated backend endpoint
- **Impact**: Admin operations now require server-side verification

### 4. ✅ Fixed CORS Configuration
- **File**: `backend/main.py`
- **Change**: 
  - Configured production frontend URL via `FRONTEND_URL` env var
  - Restricted methods to specific list (GET, POST, PUT, DELETE, PATCH)
  - Added max_age for preflight caching
- **Impact**: Prevents unauthorized cross-origin requests

### 5. ✅ Implemented Webhook Signature Verification
- **File**: `backend/routers/webhooks.py`
- **Change**: 
  - Added HMAC-SHA256 signature verification for GCash webhooks
  - Added Stripe signature verification
  - Constants via `GCASH_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET` env vars
- **Impact**: Prevents webhook spoofing and payment fraud

### 6. ✅ Removed .env Files from Git
- **Files**: `.env`, `raspberry-pi-server/.env`
- **Change**: Removed from git tracking, added to `.gitignore`
- **Impact**: Prevents credential exposure in version control
- **⚠️ ACTION REQUIRED**: Rotate all exposed Supabase keys immediately

### 7. ✅ Created Role-Based RLS Policies
- **New File**: `migrations/restrict_rls_policies.sql`
- **Change**: 
  - Created comprehensive role-based RLS policies
  - Admins have full access
  - Conductors can only access their own trips
  - General read access for authenticated users
  - Write access restricted by role
- **Impact**: Proper data isolation and access control

### 8. ✅ Added Authentication Middleware
- **File**: `backend/main.py`
- **Change**: 
  - Added `verify_supabase_token` dependency
  - Added `require_admin` dependency for admin-only endpoints
  - JWT token verification for all protected routes
- **Impact**: Backend now requires authentication

### 9. ✅ Implemented Real Notifications
- **File**: `src/pages/Notifications.jsx`
- **Change**: 
  - Removed hardcoded mock data
  - Connected to `notifications` table
  - Added real-time subscriptions
  - Implemented mark as read, delete, mark all as read
- **Impact**: Notifications now functional

### 10. ✅ Added Rate Limiting
- **File**: `backend/main.py`, `backend/requirements.txt`
- **Change**: 
  - Added `slowapi` dependency
  - Rate limited public endpoints (100 req/min)
- **Impact**: Prevents DoS attacks

### 11. ✅ Added Input Validation
- **File**: `backend/routers/analytics.py`
- **Change**: 
  - Added Pydantic validators
  - Date range validation
  - Pagination limits (1-1000)
- **Impact**: Prevents invalid/malicious input

### 12. ✅ Added Pagination
- **File**: `backend/routers/analytics.py`
- **Change**: Added limit/offset parameters to queries
- **Impact**: Prevents performance issues with large datasets

### 13. ✅ Removed Console.log Statements
- **Files**: Multiple frontend files
- **Change**: Removed all console.log statements from production code
- **Impact**: No information disclosure in production

### 14. ✅ Added Role-Based Route Protection
- **Files**: `src/App.jsx`, `src/components/Layout.jsx`
- **Change**: 
  - Added `requireAdmin` prop to ProtectedRoute
  - Sidebar filters menu items by user role
  - Admin-only routes protected
- **Impact**: UI respects user permissions

### 15. ✅ Implemented Password Reset Flow
- **File**: `src/pages/Login.jsx`
- **Change**: 
  - Added password reset form
  - Integrated with Supabase auth reset
  - Email-based reset flow
- **Impact**: Users can recover forgotten passwords

## Required Actions Before Launch

### 1. Rotate Exposed Credentials ⚠️ CRITICAL
Since `.env` files were previously committed to git, your Supabase keys may be exposed:
1. Go to Supabase Dashboard → Project Settings → API
2. Regenerate `anon` key
3. Regenerate `service_role` key
4. Update all environment variables with new keys
5. Update `.env.example` with placeholders (not real keys)

### 2. Run RLS Migration
```bash
# In Supabase SQL Editor, run:
migrations/restrict_rls_policies.sql
```

### 3. Configure Production Environment Variables

**Frontend (.env):**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-new-anon-key
VITE_RASPBERRY_PI_URL=http://your-pi-ip:5000
VITE_API_URL=https://your-backend-url.com
```

**Backend (.env):**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
FRONTEND_URL=https://your-frontend-url.com
GCASH_WEBHOOK_SECRET=your-gcash-secret
STRIPE_WEBHOOK_SECRET=your-stripe-secret
```

**Raspberry Pi (.env):**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-new-service-role-key
BUS_NUMBER=1
ENABLE_CAMERA=true
# ... other Pi config
```

### 4. Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 5. Test Authentication Flow
1. Try login with existing user
2. Verify password reset sends email
3. Verify role-based route protection works
4. Verify non-admins cannot access admin routes

### 6. Test Backend Authentication
```bash
# Test without token (should fail)
curl http://localhost:8000/api/cards/stats

# Test with token (should succeed)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:8000/api/cards/stats
```

### 7. Verify Webhook Security
- Configure GCASH_WEBHOOK_SECRET in backend .env
- Configure STRIPE_WEBHOOK_SECRET in backend .env
- Test webhook signature verification

### 8. Commit Changes
```bash
git add .
git commit -m "Security fixes: Remove hardcoded keys, add auth middleware, restrict RLS, implement real features"
```

## Remaining High Priority Tasks (Post-Launch)

These should be addressed after initial launch but are not critical for MVP:

1. **Add HTTPS enforcement** - Configure SSL certificates for production
2. **Add security headers** - Implement CSP, HSTS, X-Frame-Options
3. **Add CSRF protection** - Implement CSRF tokens for state-changing operations
4. **Add monitoring** - Configure error tracking (Sentry, LogRocket)
5. **Add logging** - Implement structured logging for security events
6. **Add backup strategy** - Configure automated database backups
7. **Add dependency updates** - Fix npm audit vulnerabilities (xlsx, dompurify, etc.)
8. **Add API documentation** - Document all backend endpoints
9. **Add integration tests** - Test authentication and authorization flows
10. **Add load testing** - Test performance under load

## Verification Checklist

Before launch, verify:

- [ ] All .env files removed from git
- [ ] New Supabase keys generated and configured
- [ ] RLS migration applied successfully
- [ ] Frontend builds without errors
- [ ] Backend starts without errors
- [ ] Login works with test user
- [ ] Password reset sends email
- [ ] Admin routes protected (non-admins denied)
- [ ] Dashboard loads without errors
- [ ] Notifications fetch from database
- [ ] Emergency alerts can be acknowledged/resolved
- [ ] CORS configured for production domain
- [ ] Rate limiting active on backend
- [ ] Webhook signature verification configured
- [ ] Console logs removed from production build

## Support

If you encounter issues:
1. Check browser console for errors
2. Check backend logs for authentication errors
3. Verify environment variables are set correctly
4. Check Supabase RLS policies in dashboard
5. Verify user roles in staff_users table
