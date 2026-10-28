-- Migration 005: Seed Production Users (Idempotent)
-- Ensures administrator and enterprise demonstration accounts exist in production.

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 1. Ensure Administrator account: Admin@TrustVault.com with password TrustVault$Snovasys#3128
INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Admin',
    'admin@trustvault.com',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'admin',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET password_hash = '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    role = 'admin',
    status = 'active',
    updated_at = NOW();

-- Handle case-insensitive match for existing admin account
UPDATE users
SET password_hash = '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    role = 'admin',
    status = 'active',
    updated_at = NOW()
WHERE LOWER(email) = LOWER('Admin@TrustVault.com');

-- 2. Owner account: kumpatistalin45@gmail.com
INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Siva (Owner)',
    'kumpatistalin45@gmail.com',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'owner',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET role = 'owner',
    status = 'active',
    updated_at = NOW();

-- 3. Owner account: jane.owner@trustvault.internal
INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Jane Doe (Owner)',
    'jane.owner@trustvault.internal',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'owner',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET role = 'owner',
    status = 'active',
    updated_at = NOW();

-- 4. Viewer account: bob.viewer@trustvault.internal
INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Bob Smith (Viewer)',
    'bob.viewer@trustvault.internal',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'viewer',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET role = 'viewer',
    status = 'active',
    updated_at = NOW();

-- 5. Additional active users
INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Siva (Viewer)',
    'sivachowdaryjampani185@gmail.com',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'viewer',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET role = 'viewer',
    status = 'active',
    updated_at = NOW();

INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Siva (Viewer)',
    '23jr1a12a6@gmail.com',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'viewer',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET role = 'viewer',
    status = 'active',
    updated_at = NOW();

INSERT INTO users (name, email, password_hash, role, status)
VALUES (
    'Vintopik Owner',
    'vintopik@gmail.com',
    '$2b$12$pB6BRZhucK5o..tZ59vDGeElsZEsQR2b7oWHlPLBVVyHZhNyoyB92',
    'owner',
    'active'
)
ON CONFLICT (email) DO UPDATE
SET role = 'owner',
    status = 'active',
    updated_at = NOW();
