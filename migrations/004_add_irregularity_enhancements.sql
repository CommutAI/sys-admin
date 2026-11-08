-- Add detailed irregularity tracking columns
ALTER TABLE fare_irregularities
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new',
ADD COLUMN IF NOT EXISTS assigned_to UUID,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS investigation_notes TEXT,
ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS first_detected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create irregularity history table for tracking all changes
CREATE TABLE IF NOT EXISTS irregularity_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    irregularity_id UUID NOT NULL REFERENCES fare_irregularities(id) ON DELETE CASCADE,
    changed_by UUID,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    old_severity VARCHAR(20),
    new_severity VARCHAR(20),
    change_type VARCHAR(50), -- created, assigned, escalated, resolved, note_added, etc.
    notes TEXT
);

-- Create irregularity attachments table for evidence
CREATE TABLE IF NOT EXISTS irregularity_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    irregularity_id UUID NOT NULL REFERENCES fare_irregularities(id) ON DELETE CASCADE,
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_name VARCHAR(255),
    file_url TEXT,
    file_type VARCHAR(50),
    file_size INTEGER,
    description TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fare_irregularities_status ON fare_irregularities(status);
CREATE INDEX IF NOT EXISTS idx_fare_irregularities_assigned_to ON fare_irregularities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fare_irregularities_escalation ON fare_irregularities(escalation_level);
CREATE INDEX IF NOT EXISTS idx_irregularity_history_irregularity ON irregularity_history(irregularity_id);
CREATE INDEX IF NOT EXISTS idx_irregularity_history_changed_at ON irregularity_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_irregularity_attachments_irregularity ON irregularity_attachments(irregularity_id);

-- Add comments
COMMENT ON COLUMN fare_irregularities.status IS 'Status: new, investigating, pending_action, resolved, escalated, closed';
COMMENT ON COLUMN fare_irregularities.assigned_to IS 'User assigned to handle this irregularity';
COMMENT ON COLUMN fare_irregularities.escalation_level IS 'Escalation level: 0=none, 1=supervisor, 2=manager, 3=director, 4=executive';
COMMENT ON COLUMN fare_irregularities.investigation_notes IS 'Notes from investigation process';
COMMENT ON COLUMN fare_irregularities.resolution_notes IS 'Notes about how the irregularity was resolved';
COMMENT ON COLUMN fare_irregularities.first_detected_at IS 'When the anomaly was first detected';
COMMENT ON COLUMN fare_irregularities.last_updated_at IS 'Last time this record was modified';

COMMENT ON TABLE irregularity_history IS 'Audit trail of all changes to irregularities';
COMMENT ON TABLE irregularity_attachments IS 'Evidence and documentation attached to irregularities';
