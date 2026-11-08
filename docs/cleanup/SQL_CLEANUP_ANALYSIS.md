# SQL Files Cleanup Analysis

## SQL Files Overview

### 1. Schema Files (Large, Comprehensive)

**supabase-schema.sql** (2800 lines)
- Purpose: Complete database schema for system admin focused deployment
- Contains: All tables, enums, RLS policies, indexes
- Status: ❌ OUTDATED - superseded by unified-schema.sql
- Recommendation: **DELETE** - Keep unified-schema.sql instead

**unified-schema.sql** (2499 lines)
- Purpose: Unified database schema for all applications
- Contains: All tables, enums, RLS policies, indexes
- Status: ✅ CURRENT - More comprehensive and up-to-date
- Recommendation: **KEEP** - This is the primary schema file

### 2. Migration Files (Small, Specific)

**add_anomaly_enhancements.sql** ✅ KEEP
- Purpose: Add anomaly detection enhancements
- Status: ✅ CURRENT - Just created
- Recommendation: **KEEP** - Essential for anomaly detection

**add_irregularity_enhancements.sql** ✅ KEEP
- Purpose: Add irregularity workflow enhancements
- Status: ✅ CURRENT - Just created
- Recommendation: **KEEP** - Essential for irregularity management

**add-backend-url-column.sql** ⚠️ DEPRECATED
- Purpose: Add backend_url column to pi_devices
- Status: ❌ UNNECESSARY - Backend auto-discovery removes need for this
- Recommendation: **DELETE** - Auto-discovery implemented in code

**add-branch-to-staff-users.sql** ✅ KEEP
- Purpose: Add branch assignment for customer service staff
- Status: ✅ USEFUL - Allows terminal assignment
- Recommendation: **KEEP** - But merge into unified-schema.sql or migrations folder

**add-password-column.sql** ⚠️ TEMPORARY
- Purpose: Add password column to staff_users
- Status: ⚠️ INCOMPLETE - TODO: implement hashing (noted in file)
- Recommendation: **MERGE** - Add password hashing implementation, then merge into schema

**add_decline_reason_column.sql** ✅ KEEP
- Purpose: Add decline_reason to card_reservations
- Status: ✅ USEFUL - Admin can decline reservations
- Recommendation: **KEEP** - But merge into unified-schema.sql

**create-config-table.sql** ❌ DEPRECATED
- Purpose: Create config table for backend URL
- Status: ❌ UNNECESSARY - Auto-discovery removes need for this
- Recommendation: **DELETE** - Backend auto-discovery makes this obsolete

**create_pi_devices.sql** ✅ KEEP
- Purpose: Create pi_devices table for Raspberry Pi management
- Status: ✅ ESSENTIAL - Pi device registration
- Recommendation: **KEEP** - But merge into unified-schema.sql

### 3. Fix/Update Files (Small, One-time)

**fix-staff-users-rls.sql** ✅ KEEP
- Purpose: Fix RLS policies for staff_users
- Status: ✅ USEFUL - Allows authenticated users to read staff_users
- Recommendation: **MERGE** - Already in unified-schema.sql, can delete if duplicate

**restore-staff-users-auth-fk.sql** ✅ KEEP
- Purpose: Remove foreign key constraint from staff_users
- Status: ✅ USEFUL - Allows email domain restrictions
- Recommendation: **MERGE** - Add to unified-schema.sql

**update-sms-queue-types.sql** ✅ KEEP
- Purpose: Update SMS queue type constraint
- Status: ✅ USEFUL - Add new SMS types
- Recommendation: **MERGE** - Add to unified-schema.sql

**update_audit_logs_action_constraint.sql** ✅ KEEP
- Purpose: Add APPROVE and DECLINE actions to audit_logs
- Status: ✅ USEFUL - Track approval actions
- Recommendation: **MERGE** - Add to unified-schema.sql

**update_card_reservations_status_constraint.sql** ✅ KEEP
- Purpose: Add approved/declined status to card_reservations
- Status: ✅ USEFUL - Admin approval workflow
- Recommendation: **MERGE** - Add to unified-schema.sql

### 4. Migration Files (Complex)

**migrations/restrict_rls_policies.sql** (277 lines)
- Purpose: Restrict RLS policies by role
- Status: ⚠️ PARTIAL - Some policies may already be in unified-schema.sql
- Recommendation: **REVIEW** - Check for duplicates with unified-schema.sql

## Cleanup Recommendations

### Files to DELETE (Obsolete)

1. ❌ **supabase-schema.sql** - Superseded by unified-schema.sql
2. ❌ **add-backend-url-column.sql** - Auto-discovery makes this obsolete
3. ❌ **create-config-table.sql** - Auto-discovery makes this obsolete

### Files to MERGE into unified-schema.sql

1. ⚠️ **add-branch-to-staff-users.sql** - Add branch column to schema
2. ⚠️ **add-password-column.sql** - Add password column with hashing
3. ⚠️ **add_decline_reason_column.sql** - Add decline_reason column
4. ⚠️ **create_pi_devices.sql** - Add pi_devices table
5. ⚠️ **fix-staff-users-rls.sql** - Merge RLS policies
6. ⚠️ **restore-staff-users-auth-fk.sql** - Remove FK constraint
7. ⚠️ **update-sms-queue-types.sql** - Update SMS types
8. ⚠️ **update_audit_logs_action_constraint.sql** - Update action constraint
9. ⚠️ **update_card_reservations_status_constraint.sql** - Update status constraint

### Files to KEEP as Separate Migrations

1. ✅ **add_anomaly_enhancements.sql** - Keep as separate migration
2. ✅ **add_irregularity_enhancements.sql** - Keep as separate migration
3. ⚠️ **migrations/restrict_rls_policies.sql** - Review and possibly merge

## Recommended File Structure

```
C:\Users\joshu\sys-admin\
├── migrations/
│   ├── 001_initial_schema.sql              # unified-schema.sql (renamed)
│   ├── 002_add_password_hashing.sql        # Enhanced password column
│   ├── 003_add_anomaly_enhancements.sql    # Current file
│   ├── 004_add_irregularity_enhancements.sql # Current file
│   └── 005_restrict_rls_policies.sql       # Current file (if needed)
└── docs/
    └── SCHEMA_CHANGES.md                   # Document schema evolution
```

## Execution Plan

### Phase 1: Delete Obsolete Files
```powershell
Remove-Item supabase-schema.sql
Remove-Item add-backend-url-column.sql
Remove-Item create-config-table.sql
```

### Phase 2: Merge into unified-schema.sql
For each file marked as "MERGE":
1. Review the changes
2. Add to unified-schema.sql with proper comments
3. Test the merged schema
4. Delete the original file

### Phase 3: Rename and Organize
```powershell
# Create migrations directory
New-Item -ItemType Directory -Path migrations

# Move files
Move-Item unified-schema.sql migrations\001_initial_schema.sql
Move-Item add_anomaly_enhancements.sql migrations\003_add_anomaly_enhancements.sql
Move-Item add_irregularity_enhancements.sql migrations\004_add_irregularity_enhancements.sql
```

### Phase 4: Create Migration Documentation
Create SCHEMA_CHANGES.md documenting:
- All schema changes in order
- Migration files and their purposes
- How to apply migrations
- Rollback procedures

## Benefits of Cleanup

1. **Reduced Confusion** - Single source of truth for schema
2. **Better Maintainability** - Clear migration history
3. **Easier Deployment** - Standardized migration process
4. **Less Duplication** - Remove obsolete or duplicate changes
5. **Version Control** - Clear migration numbering

## Notes

- **Before deleting**: Ensure all changes are in unified-schema.sql
- **Test migrations**: Apply to a test database first
- **Backup current schema**: Export current database before changes
- **Document everything**: Keep track of all changes made
