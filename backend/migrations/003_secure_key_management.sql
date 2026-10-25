-- TrustVault Secure Key Management & Envelope Encryption Migration
-- Migration 003: Idempotent & Non-destructive

-- 1. Encryption Keys Table
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

-- 2. Extend Documents Table for Envelope Encryption
ALTER TABLE documents ADD COLUMN IF NOT EXISTS encryption_version INT NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS key_id VARCHAR(50) REFERENCES encryption_keys(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS wrapped_dek TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS iv VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS auth_tag VARCHAR(64);

-- 3. Indexes for Key Management & Document Lookups
CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON encryption_keys(status);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_created_at ON encryption_keys(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_key_id ON documents(key_id);
CREATE INDEX IF NOT EXISTS idx_documents_encryption_version ON documents(encryption_version);

-- 4. Seed Default Active Master Key Record (if table empty)
INSERT INTO encryption_keys (id, name, algorithm, status, scope, created_at)
SELECT 'KEY-DEFAULT-01', 'TrustVault Root Master Key', 'AES-256-GCM', 'active', 'document', NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM encryption_keys WHERE id = 'KEY-DEFAULT-01'
);
