# Security Cleanup Instructions

## ✅ COMPLETED: Files with Hardcoded Credentials

All hardcoded Supabase credentials have been replaced with environment variable references:

### Configuration Files (Cleaned)
1. ✅ **raspberry-pi-server/.env.example** - Replaced with placeholders
2. ✅ **.env.example** (root) - Replaced with placeholders
3. ✅ **backend/.env.example** - Replaced with clean template

### Script Files (Cleaned)
4. ✅ **pi-register-ip.py** - Now uses `os.getenv()`
5. ✅ **check-gps.js** - Now uses `process.env`
6. ✅ **check-gps-from-db.cjs** - Now uses `process.env`
7. ✅ **register-pi.js** - Now uses `process.env`
8. ✅ **raspberry-pi-server/start_server.sh** - Now uses placeholders

## Action Required

1. Rotate your Supabase project keys immediately (these have been exposed)
2. Replace all hardcoded URLs with environment variable references
3. Update script files to read from environment variables
4. Add these files to .gitignore
5. Never commit actual .env files with real credentials

## Environment Variable Standard

Use these standard names across all components:
- `SUPABASE_URL` - Project URL
- `SUPABASE_ANON_KEY` - Anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (backend only)
