-- Migration: Add feedback table for bug reports, customer feedback, and feature requests
-- Created: 2024-12-01

-- Create feedback type enum
CREATE TYPE feedback_type AS ENUM ('bug_report', 'feedback', 'feature_request');

-- Create feedback status enum
CREATE TYPE feedback_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- Create feedback priority enum
CREATE TYPE feedback_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type feedback_type NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    contact_email VARCHAR(255),
    priority feedback_priority NOT NULL DEFAULT 'medium',
    status feedback_status NOT NULL DEFAULT 'open',
    screenshot_url TEXT,
    device_info VARCHAR(500),
    app_version VARCHAR(50),
    admin_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_priority ON feedback(priority);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_feedback_updated_at();

-- Add RLS (Row Level Security) policies
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
    ON feedback FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert feedback (including anonymous)
CREATE POLICY "Anyone can insert feedback"
    ON feedback FOR INSERT
    WITH CHECK (true);

-- Service role can do everything (for admin operations)
CREATE POLICY "Service role has full access"
    ON feedback
    USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE feedback IS 'Stores bug reports, customer feedback, and feature requests';
COMMENT ON COLUMN feedback.user_id IS 'Optional user ID - NULL for anonymous submissions';
COMMENT ON COLUMN feedback.contact_email IS 'Email for follow-up, useful for anonymous users';
COMMENT ON COLUMN feedback.device_info IS 'Browser/device information for bug reports';
COMMENT ON COLUMN feedback.admin_notes IS 'Internal notes for the support team';

