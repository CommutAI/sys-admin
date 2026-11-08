# Codebase Cleanup Plan

## Files to Remove (Duplicates)

### 1. Duplicate Setup Scripts
**Remove**: `raspberry-pi-server/auto_setup.sh`
**Keep**: `raspberry-pi-server/auto-setup.sh` (more comprehensive)

**Reason**: Two setup scripts with different complexity. Keep the comprehensive one.

### 2. Duplicate Restart Scripts
**Remove**: `restart_pi_server.sh` (root level)
**Keep**: `raspberry-pi-server/restart_pi_server.sh` (in Pi server directory)

**Reason**: Redundant script in wrong location. Keep the one in the proper directory.

### 3. Duplicate Windows Startup Scripts
**Remove**: `backend/start-backend.bat`
**Keep**: `backend/start_backend.bat`

**Reason**: Two Windows startup scripts with different casing. Consolidate to one.

## Files to Clean

### 1. Corrupted .env.example
**File**: `backend/.env.example`
**Issue**: Contains console logs instead of configuration template
**Action**: Replace with clean template from `backend/.env.video-processing`

### 2. Hardcoded Credentials
**Files**: (See CLEANUP_CREDENTIALS.md for full list)
**Action**: Replace with environment variable placeholders

## Documentation Consolidation

### Files to Consolidate or Cross-Reference

**Deployment Guides**:
- `docs/DEPLOYMENT_GUIDE.md`
- `backend/DEPLOYMENT.md`
- `raspberry-pi-server/DEPLOYMENT.md`
- `DEPLOYMENT_INSTRUCTIONS.md`

**Action**: Keep the main `DEPLOYMENT.md` (root level) and cross-reference others.

**Auto-Start Guides**:
- `docs/AUTO_START_GUIDE.md`
- `docs/README_AUTO_START.md`
- `backend/AUTO_START_SETUP.md`
- `raspberry-pi-server/AUTO_START_SETUP.md`

**Action**: Consolidate into one comprehensive guide or create index.

**Setup Guides**:
- `docs/PI_SETUP_INSTRUCTIONS.md`
- `raspberry-pi-server/README.md`
- `raspberry-pi-server/SETUP_MINIMAL.md`

**Action**: Keep main README, cross-reference others as alternative methods.

## Directory Organization

### Recommended Structure
```
C:\Users\joshu\sys-admin\
├── .gitignore                    # ✅ Created
├── SECURITY.md                   # ✅ Created
├── DEPLOYMENT.md                 # ✅ Created
├── CLEANUP_CREDENTIALS.md        # ✅ Created
├── CODEBASE_CLEANUP.md           # ✅ This file
├── README.md                     # Keep - Main project docs
├── src/                          # Frontend
├── backend/                      # Backend
│   ├── routers/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── auth.py
│   ├── video_processor.py
│   ├── anomaly_detection.py
│   ├── requirements.txt
│   ├── .env.example              # Clean this
│   ├── DEPLOYMENT.md             # Consolidate with root
│   ├── AUTO_START_SETUP.md       # Consolidate with root
│   └── start_backend.bat         # Keep this
├── raspberry-pi-server/          # Pi Server
│   ├── video_server_fastapi.py
│   ├── hardware_integration.py
│   ├── requirements.txt
│   ├── .env.example              # ✅ Cleaned
│   ├── auto-setup.sh             # Keep
│   ├── auto_setup.sh             # Remove
│   ├── DEPLOYMENT.md             # Consolidate with root
│   ├── AUTO_START_SETUP.md       # Consolidate with root
│   └── README.md                 # Keep
├── docs/                         # Keep all
│   ├── DEPLOYMENT_GUIDE.md       # Cross-reference
│   ├── AUTO_START_GUIDE.md       # Cross-reference
│   └── ...
├── migrations/                   # Keep
└── scripts/                      # NEW - Move all scripts here
    ├── deployment/
    ├── setup/
    └── maintenance/
```

## Configuration Standardization

### Service Files - Standardize These

**User Accounts**:
- Backend service: `www-data` (Linux) or run as SYSTEM (Windows)
- Pi service: `chichi` (or `pi` - document choice)

**Installation Paths**:
- Backend: `/var/www/commutai/backend` (Linux) or `C:\commutai\backend` (Windows)
- Pi: `/home/chichi/raspberry-pi-server` (document as standard)

**Environment Variables**:
- Use `SUPABASE_URL` consistently
- Use `SUPABASE_ANON_KEY` for anon key
- Use `SUPABASE_SERVICE_ROLE_KEY` for service role (backend only)

## Environment Variable Validation

### Add to All Components

Add startup validation to ensure required environment variables are set:

**Backend (backend/main.py)**:
```python
required_vars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
missing = [v for v in required_vars if not os.getenv(v)]
if missing:
    raise RuntimeError(f"Missing required environment variables: {missing}")
```

**Pi Server (video_server_fastapi.py)**:
```python
required_vars = ['SUPABASE_URL', 'SUPABASE_KEY']
missing = [v for v in required_vars if not os.getenv(v)]
if missing:
    raise RuntimeError(f"Missing required environment variables: {missing}")
```

## Docker Deployment (Add)

### Create Docker Files

**backend/Dockerfile**:
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
```

## Execution Order

### Phase 1: Critical Security (Do First)
1. ✅ Create .gitignore
2. ✅ Create SECURITY.md
3. ✅ Create CLEANUP_CREDENTIALS.md
4. ✅ Clean raspberry-pi-server/.env.example
5. ✅ Clean all other files with hardcoded credentials
6. ⏳ Rotate Supabase keys

### Phase 2: File Cleanup
1. ⏳ Remove duplicate scripts
2. ⏳ Clean corrupted .env.example
3. ⏳ Remove redundant documentation

### Phase 3: Organization
1. ⏳ Create scripts/ directory
2. ⏳ Move deployment scripts
3. ⏳ Update service files with standardized paths
4. ⏳ Consolidate documentation

### Phase 4: Enhancement
1. ✅ Add environment variable validation
2. ⏳ Create Docker configuration
3. ✅ Add health check endpoints (already implemented)
4. ⏳ Add .env.example validation script

## Testing After Cleanup

1. Backend starts successfully
2. Pi service starts successfully
3. Frontend connects to backend
4. Pi connects to backend
5. Anomaly detection runs without errors
6. All environment variables are validated

## Notes

- **Do NOT delete files without user approval** - this is a plan
- **Test thoroughly after each change**
- **Commit changes incrementally**
- **Document all changes in commit messages**
