# Database Migration Guide

## Overview

All SQL migration files are now organized in the `migrations/` directory with a clear naming convention and numbering system.

## Migration Structure

```
migrations/
├── 001_initial_schema.sql                    # Complete database schema
├── 002_add_branch_to_staff_users.sql         # Add branch assignment for CS staff
├── 003_add_anomaly_enhancements.sql          # Anomaly detection enhancements
├── 004_add_irregularity_enhancements.sql     # Irregularity workflow enhancements
├── 005_restrict_rls_policies.sql             # Role-based RLS policies
├── 006_add_password_column.sql               # Password column (TODO: implement hashing)
├── 007_add_decline_reason_column.sql         # Decline reason for card reservations
├── 008_create_pi_devices.sql                 # Pi device registration table
├── 009_fix_staff_users_rls.sql               # Fix RLS policies for staff_users
├── 010_restore_staff_users_auth_fk.sql        # Remove auth.users FK constraint
├── 011_update_sms_queue_types.sql            # Update SMS queue type constraint
├── 012_update_audit_logs_action_constraint.sql # Add APPROVE/DECLINE actions
└── 013_update_card_reservations_status_constraint.sql # Add approved/declined status
```

## Applying Migrations

### Fresh Installation

For a new database, run migrations in order:

```sql
-- In Supabase SQL Editor, run in order:
-- 1. 001_initial_schema.sql (creates all tables, enums, RLS policies)
-- 2. 002_add_branch_to_staff_users.sql
-- 3. 003_add_anomaly_enhancements.sql
-- 4. 004_add_irregularity_enhancements.sql
-- 5. 005_restrict_rls_policies.sql
-- 6. 006_add_password_column.sql
-- 7. 007_add_decline_reason_column.sql
-- 8. 008_create_pi_devices.sql
-- 9. 009_fix_staff_users_rls.sql
-- 10. 010_restore_staff_users_auth_fk.sql
-- 11. 011_update_sms_queue_types.sql
-- 12. 012_update_audit_logs_action_constraint.sql
-- 13. 013_update_card_reservations_status_constraint.sql
```

### Existing Database

For an existing database that already has some changes:

1. **Check which migrations have been applied:**
   - Review your current database schema
   - Compare with migration files
   - Skip migrations that are already applied

2. **Apply missing migrations:**
   - Run only the migrations that haven't been applied yet
   - Test in a development environment first

## Migration Details

### 001_initial_schema.sql
- **Purpose**: Complete database schema for all applications
- **Contains**: All tables, enums, RLS policies, indexes
- **Size**: 2499 lines
- **Status**: ✅ Current - Primary schema file
- **Notes**: This is the foundation schema that should be run first

### 002_add_branch_to_staff_users.sql
- **Purpose**: Add branch assignment for customer service staff
- **Changes**: Adds `branch` column to `staff_users` table
- **Values**: `manolo_fortich_terminal`, `agora_terminal`
- **Status**: ✅ Useful - Allows terminal assignment

### 003_add_anomaly_enhancements.sql
- **Purpose**: Add anomaly detection enhancements
- **Changes**: Extends anomaly detection with multiple scenarios
- **Features**: Severity levels, metrics, recommendations, irregularity workflow
- **Status**: ✅ Current - Essential for anomaly detection

### 004_add_irregularity_enhancements.sql
- **Purpose**: Add irregularity workflow enhancements
- **Changes**: Add status management, assignment, escalation, notes, history, attachments
- **Status**: ✅ Current - Essential for irregularity management

### 005_restrict_rls_policies.sql
- **Purpose**: Restrict RLS policies by role
- **Changes**: Role-based access control for all tables
- **Roles**: admin, conductor, driver, cs_desk, operator
- **Status**: ⚠️ Review - Check for duplicates with initial schema

### 006_add_password_column.sql
- **Purpose**: Add password column to staff_users
- **Changes**: Adds `password` column
- **Status**: ⚠️ Incomplete - TODO: implement hashing
- **Note**: Currently plain text - must implement bcrypt hashing

### 007_add_decline_reason_column.sql
- **Purpose**: Add decline_reason to card_reservations
- **Changes**: Adds `decline_reason` column
- **Status**: ✅ Useful - Admin can decline reservations with reason

### 008_create_pi_devices.sql
- **Purpose**: Create pi_devices table for Raspberry Pi management
- **Changes**: Creates `pi_devices` table
- **Features**: Bus number, IP address, port, last_seen, hostname
- **Status**: ✅ Essential - Pi device registration and auto-discovery

### 009_fix_staff_users_rls.sql
- **Purpose**: Fix RLS policies for staff_users
- **Changes**: Allows authenticated users to read staff_users
- **Status**: ✅ Useful - Already in initial schema, check for duplicates

### 010_restore_staff_users_auth_fk.sql
- **Purpose**: Remove foreign key constraint from staff_users
- **Changes**: Removes FK to auth.users
- **Reason**: Allows email domain restrictions
- **Status**: ✅ Useful - Email domain validation

### 011_update_sms_queue_types.sql
- **Purpose**: Update SMS queue type constraint
- **Changes**: Adds new SMS types
- **Types**: emergency, alighting, other, admin, test, reservation_confirmation, card_approved, card_declined, emergency_bus, trip_completion, topup
- **Status**: ✅ Useful - Comprehensive SMS types

### 012_update_audit_logs_action_constraint.sql
- **Purpose**: Add APPROVE and DECLINE actions to audit_logs
- **Changes**: Adds approval workflow tracking
- **Status**: ✅ Useful - Track approval actions

### 013_update_card_reservations_status_constraint.sql
- **Purpose**: Add approved/declined status to card_reservations
- **Changes**: Adds status values for approval workflow
- **Status**: ✅ Useful - Admin approval workflow

## Deleted Files

The following files were deleted as obsolete:

1. ❌ **supabase-schema.sql** - Superseded by unified-schema.sql (now 001_initial_schema.sql)
2. ❌ **add-backend-url-column.sql** - Auto-discovery makes this obsolete
3. ❌ **create-config-table.sql** - Auto-discovery makes this obsolete

## Best Practices

### When Adding New Migrations

1. **Number sequentially**: Use the next available number (e.g., 014, 015)
2. **Use descriptive names**: Describe what the migration does
3. **Use IF NOT EXISTS**: Make migrations idempotent
4. **Add comments**: Explain the purpose of each change
5. **Test thoroughly**: Test in development before production

### Migration Naming Convention

```
{number}_{action}_{entity}.sql

Examples:
- 001_initial_schema.sql
- 002_add_branch_to_staff_users.sql
- 003_add_anomaly_enhancements.sql
- 014_remove_old_column.sql
- 015_update_constraint.sql
```

### Rollback Procedures

Each migration should be designed to be reversible where possible. If a migration cannot be reversed, document this clearly in the migration file.

## Troubleshooting

### Migration Fails

1. **Check dependencies**: Ensure previous migrations are applied
2. **Check for conflicts**: Look for conflicting changes
3. **Check database state**: Verify current schema
4. **Review error messages**: Check Supabase error logs

### Duplicate Changes

If a migration contains changes already in the database:

1. **Skip the migration**: Don't run it again
2. **Or modify**: Use IF NOT EXISTS guards
3. **Or rollback**: Revert previous changes and re-apply

## Security Notes

1. **Review RLS policies**: Ensure policies are restrictive enough
2. **Test with different roles**: Verify role-based access
3. **Monitor audit logs**: Check for unauthorized access
4. **Rotate credentials**: After password hashing is implemented

## Password Hashing TODO

Migration 006_add_password_column.sql currently stores passwords in plain text. This MUST be fixed:

1. Implement bcrypt hashing in the backend
2. Update password column to use hashed values
3. Update migration documentation
4. Test authentication with hashed passwords

## Next Steps

1. **Review migrations**: Check for duplicates and conflicts
2. **Test migrations**: Apply to a test database
3. **Document changes**: Update this guide with any changes
4. **Automate migrations**: Consider using a migration tool (Flyway, Liquibase, etc.)
5. **Implement password hashing**: Complete the TODO in migration 006

## Support

For questions or issues with migrations:
- Check migration files for comments
- Review database schema in Supabase
- Consult the main DEPLOYMENT.md guide
