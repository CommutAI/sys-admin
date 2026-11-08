# CommutAI Security Guidelines

## Critical Security Issues

### 1. Hardcoded Credentials ⚠️ CRITICAL

**Status**: Supabase URLs and keys are hardcoded in multiple files.

**Files Affected**:
- `raspberry-pi-server/.env.example`
- `.env.example` (root)
- `backend/.env.example`
- `pi-register-ip.py`
- `check-gps.js`
- `check-gps-from-db.cjs`
- `register-pi.js`
- `raspberry-pi-server/start_server.sh`

**Immediate Actions Required**:
1. Rotate all Supabase project keys immediately
2. Replace hardcoded credentials with environment variables
3. Add sensitive files to `.gitignore`
4. Never commit `.env` files with real credentials

**See**: `CLEANUP_CREDENTIALS.md` for detailed instructions

### 2. Password Storage ⚠️ HIGH

**Status**: Passwords stored in plain text in `staff_users` table.

**Required Actions**:
1. Implement bcrypt/argon2 password hashing
2. Add `password_hash` column to `staff_users`
3. Migrate existing passwords to hashed versions
4. Update authentication logic to verify hashes

**Implementation Reference**:
```python
import bcrypt

# Hash password
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

# Verify password
bcrypt.checkpw(password.encode('utf-8'), hashed)
```

### 3. Environment Variable Security

**Best Practices**:
- Never commit `.env` files
- Use different keys for dev/staging/production
- Rotate keys regularly (every 90 days)
- Use service role keys only on backend servers
- Restrict key permissions in Supabase dashboard

## Authentication & Authorization

### Current Implementation
- JWT token verification for API access
- Supabase Auth for frontend
- Service role key for backend database access

### Recommendations
1. Implement token refresh mechanism
2. Add token expiration
3. Implement role-based access control (RBAC)
4. Add multi-factor authentication for admin users
5. Audit log for all authentication events

## Data Security

### Database Security
- **Row Level Security (RLS)**: ✅ Implemented
- **Service Role Key**: ✅ Used for backend
- **Recommendations**:
  - Enable RLS on all tables
  - Use least privilege principle
  - Implement database backups
  - Enable query logging in Supabase

### API Security
- **Rate Limiting**: ✅ Implemented with slowapi
- **CORS**: Configurable middleware
- **Recommendations**:
  - Implement API key authentication for third-party access
  - Add request signing for webhooks
  - Implement IP whitelisting for admin endpoints
  - Add request size limits

## Network Security

### Current Implementation
- WebSocket for video streaming
- HTTP for API communication
- Auto IP discovery for Pi

### Recommendations
1. Enable HTTPS in production (TLS/SSL)
2. Implement WebSocket authentication
3. Add VPN requirement for Pi connections
4. Implement firewall rules
5. Use secure WebSocket (wss://)

## Hardware Security

### Raspberry Pi
- **Physical Access**: Secure Pi enclosure
- **SSH Keys**: Use key-based authentication
- **Default Passwords**: Change default pi user password
- **Updates**: Keep system updated

### GPS & SMS
- SIM card: Protect from unauthorized removal
- GPS module: Secure physical connection
- SMS module: Protect SIM card PIN

## Logging & Monitoring

### Current Logging
- Console logs for all components
- Systemd journal for services
- Supabase query logs

### Recommendations
1. Implement centralized logging (ELK, Graylog)
2. Add audit trail for sensitive operations
3. Implement log rotation
4. Monitor for suspicious activity
5. Set up alerts for security events

## Backup & Recovery

### Database
- **Supabase**: Automatic backups enabled
- **Recommendations**:
  - Enable point-in-time recovery
  - Regular snapshot exports
  - Test restore procedures

### Configuration
- Backup all `.env` files
- Document all service configurations
- Version control deployment scripts

## Compliance

### Data Privacy
- PII (Personally Identifiable Information): Staff user data
- GPS data: Location tracking
- **Recommendations**:
  - Implement data retention policies
  - Provide data export for users
  - Implement data deletion on request
  - Comply with local data protection laws

## Security Checklist

### Before Production Deployment

- [ ] Replace all hardcoded credentials
- [ ] Rotate all Supabase keys
- [ ] Implement password hashing
- [ ] Enable HTTPS
- [ ] Configure RLS on all tables
- [ ] Set up rate limiting
- [ ] Implement audit logging
- [ ] Configure backup strategy
- [ ] Test restore procedures
- [ ] Review and limit service permissions
- [ ] Enable security headers (CSP, XSS protection)
- [ ] Implement input validation
- [ ] Sanitize all user inputs
- [ ] Configure CORS properly
- [ ] Set up monitoring and alerts

### Ongoing Security

- [ ] Regular security audits (quarterly)
- [ ] Dependency updates (monthly)
- [ ] Key rotation (quarterly)
- [ ] Access review (monthly)
- [ ] Log review (weekly)
- [ ] Penetration testing (annually)

## Incident Response

### Security Incident Steps
1. Identify and contain the breach
2. Assess impact and scope
3. Notify affected parties
4. Rotate all credentials
5. Review and patch vulnerabilities
6. Document lessons learned
7. Update security policies

## Contact

For security concerns:
- Report security issues privately
- Do not disclose vulnerabilities publicly
- Follow responsible disclosure practices
