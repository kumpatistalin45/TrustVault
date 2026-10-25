-- Migration 004: Firebase Passwordless Email Link Authentication Tokens
-- Application-controlled single-use token table for 10-minute link expiry enforcement.
-- Firebase's default email-link expiry cannot be reduced to 10 minutes; this table
-- implements a server-side gate that independently enforces the 10-minute window.
-- The Firebase ID token is still verified on the backend, but authentication only
-- completes if the application token is valid, unexpired, and unconsumed.

CREATE TABLE IF NOT EXISTS email_link_tokens (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    VARCHAR(64) NOT NULL UNIQUE,         -- SHA-256 hex of the raw token (never stored in plain)
    email         VARCHAR(255) NOT NULL,               -- normalized email for cross-verification
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL,                -- exactly 10 minutes from created_at
    consumed_at   TIMESTAMPTZ,                         -- set atomically when token is redeemed
    revoked_at    TIMESTAMPTZ,                         -- set when superseded by a regeneration request
    ip_address    VARCHAR(45),                         -- requesting IP for abuse tracking
    user_agent    VARCHAR(512)                         -- truncated UA string for audit purposes
);

CREATE INDEX IF NOT EXISTS idx_email_link_tokens_hash
    ON email_link_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_email_link_tokens_user
    ON email_link_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_link_tokens_expires
    ON email_link_tokens (expires_at);

-- Cooldown tracking: one row per email per request window (upserted on each send)
CREATE TABLE IF NOT EXISTS email_link_cooldowns (
    email         VARCHAR(255) PRIMARY KEY,
    last_sent_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    send_count    INT         NOT NULL DEFAULT 1,
    window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_link_cooldowns_email
    ON email_link_cooldowns (email);
