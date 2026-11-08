# CommutAI Documentation

Welcome to the CommutAI documentation hub. This directory contains all project documentation organized by category.

## Documentation Structure

```
docs/
├── README.md (this file)
├── architecture/          # System architecture and technical guides
├── deployment/            # Deployment and setup guides
├── security/              # Security guidelines and best practices
└── cleanup/               # Cleanup and maintenance documentation
```

## Quick Links

### Deployment
- [DEPLOYMENT.md](deployment/DEPLOYMENT.md) - Main deployment guide for all components
- [AUTO_START.md](deployment/AUTO_START.md) - Auto-start configuration guide
- [PI_SETUP_INSTRUCTIONS.md](deployment/PI_SETUP_INSTRUCTIONS.md) - Raspberry Pi setup instructions
- [SETUP_MINIMAL.md](deployment/SETUP_MINIMAL.md) - Minimal setup guide

### Architecture
- [VIDEO_PROCESSING_ARCHITECTURE.md](architecture/VIDEO_PROCESSING_ARCHITECTURE.md) - Video processing system architecture
- [AUTO_IP_DETECTION_GUIDE.md](architecture/AUTO_IP_DETECTION_GUIDE.md) - Automatic IP detection system
- [REALTIME_OPTIMIZATION.md](architecture/REALTIME_OPTIMIZATION.md) - Real-time optimization techniques
- [VIDEO_MONITORING_SETUP.md](architecture/VIDEO_MONITORING_SETUP.md) - Video monitoring setup guide
- [SIM900A_SETUP.md](architecture/SIM900A_SETUP.md) - SIM900A GSM module setup
- [ULTRA_LOW_LATENCY_GUIDE.md](architecture/ULTRA_LOW_LATENCY_GUIDE.md) - Low latency optimization
- [STREAM_MODE_SETUP.md](architecture/STREAM_MODE_SETUP.md) - Stream mode setup
- [AUDIT_LOGGING_IMPLEMENTATION.md](architecture/AUDIT_LOGGING_IMPLEMENTATION.md) - Audit logging implementation

### Security
- [SECURITY.md](security/SECURITY.md) - Security guidelines and best practices
- [CLEANUP_CREDENTIALS.md](security/CLEANUP_CREDENTIALS.md) - Credential cleanup instructions

### Cleanup & Maintenance
- [CLEANUP_FINAL_REPORT.md](cleanup/CLEANUP_FINAL_REPORT.md) - Final cleanup report
- [CODEBASE_CLEANUP.md](cleanup/CODEBASE_CLEANUP.md) - Codebase cleanup plan

## Getting Started

### New to CommutAI?

1. Read the main [README.md](../README.md) in the project root
2. Follow the [DEPLOYMENT.md](deployment/DEPLOYMENT.md) guide to set up the system
3. Configure auto-start using [AUTO_START.md](deployment/AUTO_START.md)

### System Architecture

Understand the system architecture:
- [VIDEO_PROCESSING_ARCHITECTURE.md](architecture/VIDEO_PROCESSING_ARCHITECTURE.md) - How video processing works
- [AUTO_IP_DETECTION_GUIDE.md](architecture/AUTO_IP_DETECTION_GUIDE.md) - How IP auto-discovery works
- [REALTIME_OPTIMIZATION.md](architecture/REALTIME_OPTIMIZATION.md) - Real-time performance optimization

### Security

Review security guidelines:
- [SECURITY.md](security/SECURITY.md) - Security best practices
- [CLEANUP_CREDENTIALS.md](security/CLEANUP_CREDENTIALS.md) - Credential management

### Maintenance

For maintenance and cleanup:
- [CLEANUP_FINAL_REPORT.md](cleanup/CLEANUP_FINAL_REPORT.md) - Recent cleanup activities
- [CODEBASE_CLEANUP.md](cleanup/CODEBASE_CLEANUP.md) - Codebase cleanup plan

## Component-Specific Documentation

### Backend
- See [backend/README.md](../backend/README.md) for backend-specific documentation
- [backend/INSTALL_WINDOWS_SERVICE.md](../backend/INSTALL_WINDOWS_SERVICE.md) - Windows service installation

### Raspberry Pi
- See [raspberry-pi-server/README.md](../raspberry-pi-server/README.md) for Pi-specific documentation

### Database
- See [migrations/README.md](../migrations/README.md) for database migration documentation

## Documentation Standards

When creating new documentation:

1. **Use clear, descriptive titles**
2. **Organize by category** (architecture, deployment, security, cleanup)
3. **Include a table of contents** for longer documents
4. **Add code examples** where applicable
5. **Keep it up to date** with the codebase
6. **Mark legacy documents** with "_LEGACY" suffix

## Contributing

To improve documentation:

1. Make changes to the relevant markdown file
2. Update this README.md if adding new categories
3. Keep legacy documents for reference but mark them clearly
4. Test any commands or procedures before documenting

## Questions?

For questions about the documentation:
- Check the relevant category first
- Look at legacy documents if the current one doesn't help
- Review the main project README.md
- Check the deployment guide for setup issues

---

**Last Updated**: 2026-11-08
**Documentation Version**: 1.0
