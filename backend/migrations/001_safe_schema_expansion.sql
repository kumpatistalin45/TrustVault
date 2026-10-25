-- TrustVault Safe Idempotent Schema Expansion
-- Preserves existing tables and data. Does not drop or delete.

-- 1. Users table additions: status, mobile, avatar_url, last_login, terms
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(25);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

-- Safe constraint verification for status column if not already present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_status_check
            CHECK (status IN ('active', 'pending', 'suspended', 'rejected'));
    END IF;
END $$;

-- 2. Complaints / Support tickets table
CREATE TABLE IF NOT EXISTS complaints (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference_id VARCHAR(50) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    related_document_name VARCHAR(255),
    attachment_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'Submitted'
        CHECK (status IN ('Submitted', 'In Review', 'Resolved', 'Closed')),
    priority VARCHAR(20) NOT NULL DEFAULT 'Medium'
        CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Password reset tokens table (stores SHA-256 hash of single-use recovery tokens)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Document Access Secret Key (hashed)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS secret_key_hash VARCHAR(64);

-- 5. Safe Indexes
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);
