CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'owner'
        CHECK (role IN ('admin', 'owner', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    storage_key TEXT NOT NULL UNIQUE,
    mime_type VARCHAR(150) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    timer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    timer_duration_minutes INT NOT NULL DEFAULT 5,
    auto_delete BOOLEAN NOT NULL DEFAULT TRUE,
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id BIGINT NOT NULL
        REFERENCES documents(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(10) NOT NULL
        CHECK (permission IN ('read', 'edit')),
    granted_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    document_id BIGINT,
    target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    outcome VARCHAR(20) NOT NULL
        CHECK (outcome IN ('success', 'denied', 'failure')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner
    ON documents(owner_id);

CREATE INDEX IF NOT EXISTS idx_documents_category
    ON documents(category);

CREATE INDEX IF NOT EXISTS idx_documents_created_at
    ON documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_permissions_user_document
    ON document_permissions(user_id, document_id);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
    ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_action_outcome
    ON audit_logs(action, outcome);

CREATE INDEX IF NOT EXISTS idx_audit_document_id
    ON audit_logs(document_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expire
    ON user_sessions(expire);

-- Document Access Timer & Self-Destruct Schema Migrations
ALTER TABLE documents ADD COLUMN IF NOT EXISTS timer_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS timer_duration_minutes INT NOT NULL DEFAULT 5;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auto_delete BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS secret_key_hash VARCHAR(64);

-- Users profile & status extensions (Owner Approval Workflow)
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(25);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_status_check
            CHECK (status IN ('active', 'pending', 'suspended', 'rejected'));
    END IF;
END $$;

-- Complaints / Support Tickets Table
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

-- Password Reset Recovery Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additional Performance & Security Indexes
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Master Data Management Schema Extensions (Admin -> Owner -> Viewer)
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General Operations';
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_state VARCHAR(20) DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_state VARCHAR(20) DEFAULT 'granted';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_approval_state_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_approval_state_check
            CHECK (approval_state IN ('approved', 'pending', 'rejected'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_access_state_check'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_access_state_check
            CHECK (access_state IN ('granted', 'restricted', 'revoked'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_owner_id ON users(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department);

-- Secure Key Management & Envelope Encryption
CREATE TABLE IF NOT EXISTS encryption_keys (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    algorithm VARCHAR(30) NOT NULL DEFAULT 'AES-256-GCM',
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'rotated', 'revoked')),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    wrapped_key_bytes TEXT,
    scope VARCHAR(50) NOT NULL DEFAULT 'document'
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_version INT NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS key_id VARCHAR(50) REFERENCES encryption_keys(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS wrapped_dek TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS iv VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auth_tag VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON encryption_keys(status);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_created_at ON encryption_keys(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_key_id ON documents(key_id);
CREATE INDEX IF NOT EXISTS idx_documents_encryption_version ON documents(encryption_version);



