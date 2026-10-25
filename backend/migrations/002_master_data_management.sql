-- TrustVault Migration 002: Master Data Management Schema Expansion
-- Adds provisioning relationships, approval states, and department metadata.
-- Idempotent and safe: preserves existing tables, users, documents, and permissions.

-- 1. Owner & Creator Provisioning Links
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- 2. Master Data Profile Attributes
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General Operations';
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_state VARCHAR(20) DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_state VARCHAR(20) DEFAULT 'granted';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Update Status Constraint to Include 'inactive'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_status_check;
    END IF;
    ALTER TABLE users ADD CONSTRAINT users_status_check
        CHECK (status IN ('active', 'inactive', 'pending', 'suspended', 'rejected'));
END $$;

-- 4. Constraint for approval_state
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_approval_state_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_approval_state_check
            CHECK (approval_state IN ('approved', 'pending', 'rejected'));
    END IF;
END $$;

-- 5. Constraint for access_state
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_access_state_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_access_state_check
            CHECK (access_state IN ('granted', 'restricted', 'revoked'));
    END IF;
END $$;

-- 6. Performance & Search Indexes
CREATE INDEX IF NOT EXISTS idx_users_owner_id ON users(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department);
