/**
 * TrustVault Secure Key Management & Envelope Encryption Service
 * Implements:
 * - 256-bit AES Key Generation via crypto.randomBytes(32)
 * - Key Encryption Key (KEK) Wrapping & Unwrapping via AES-256-GCM
 * - Per-document Data Encryption Key (DEK) Envelope Encryption (TVE2)
 * - Backward compatibility with legacy TVE1 envelopes
 * - Key Rotation with safe DEK rewrapping
 * - Key Revocation enforcement
 * - Strict non-exposure of raw keys in logs and audit events
 */

const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_BYTES_LENGTH = 32; // 256-bit AES key

/**
 * Get server master Key Encryption Key (KEK) from environment.
 * Must be a 64-char hex string (32 bytes).
 */
function getMasterKek() {
  const keyHex = process.env.FILE_ENCRYPTION_KEY;

  if (typeof keyHex !== "string" || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error("FILE_ENCRYPTION_KEY must be a 32-byte hexadecimal key");
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Generate cryptographically secure 256-bit AES key.
 */
function generateKeyBytes() {
  return crypto.randomBytes(KEY_BYTES_LENGTH);
}

/**
 * Wrap a key (e.g. DEK or managed KEK) using a wrapping key via AES-256-GCM.
 * Packed format: ivHex:authTagHex:ciphertextHex
 */
function wrapKey(keyToWrap, wrappingKey = getMasterKek()) {
  if (!Buffer.isBuffer(keyToWrap) || keyToWrap.length !== KEY_BYTES_LENGTH) {
    throw new TypeError("Key to wrap must be a 32-byte Buffer");
  }
  if (!Buffer.isBuffer(wrappingKey) || wrappingKey.length !== KEY_BYTES_LENGTH) {
    throw new TypeError("Wrapping key must be a 32-byte Buffer");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, wrappingKey, iv);

  const ciphertext = Buffer.concat([
    cipher.update(keyToWrap),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Unwrap a key using wrapping key via AES-256-GCM.
 * Validates integrity via authentication tag.
 */
function unwrapKey(wrappedKeyStr, wrappingKey = getMasterKek()) {
  if (typeof wrappedKeyStr !== "string") {
    throw new TypeError("Wrapped key must be a string");
  }
  if (!Buffer.isBuffer(wrappingKey) || wrappingKey.length !== KEY_BYTES_LENGTH) {
    throw new TypeError("Wrapping key must be a 32-byte Buffer");
  }

  const parts = wrappedKeyStr.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid wrapped key format");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  if (
    !/^[a-fA-F0-9]{24}$/.test(ivHex) ||
    !/^[a-fA-F0-9]{32}$/.test(authTagHex) ||
    !/^[a-fA-F0-9]{64}$/.test(cipherHex)
  ) {
    throw new Error("Invalid wrapped key components");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, wrappingKey, iv);
  decipher.setAuthTag(authTag);

  try {
    const unwrapped = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    if (unwrapped.length !== KEY_BYTES_LENGTH) {
      throw new Error("Unwrapped key has invalid length");
    }
    return unwrapped;
  } catch (err) {
    throw new Error("Key unwrapping authentication failed (tamper or wrong key)");
  }
}

/**
 * Encrypt document buffer using per-document DEK with fresh 12-byte IV.
 */
function encryptDocumentWithDek(plaintext, dek) {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError("Plaintext must be a Buffer");
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES_LENGTH) {
    throw new TypeError("DEK must be a 32-byte Buffer");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
    ciphertext
  };
}

/**
 * Decrypt document buffer using per-document DEK.
 */
function decryptDocumentWithDek(ciphertext, ivHex, authTagHex, dek) {
  if (!Buffer.isBuffer(ciphertext)) {
    throw new TypeError("Ciphertext must be a Buffer");
  }
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES_LENGTH) {
    throw new TypeError("DEK must be a 32-byte Buffer");
  }
  if (!/^[a-fA-F0-9]{24}$/.test(ivHex) || !/^[a-fA-F0-9]{32}$/.test(authTagHex)) {
    throw new Error("Invalid IV or authentication tag format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
}

/**
 * Pack ciphertext into TVE2 envelope format:
 * [Magic (4 bytes 'TVE2')] [IV (12 bytes)] [Auth Tag (16 bytes)] [Ciphertext]
 */
function createTVE2Envelope(ivHex, authTagHex, ciphertext) {
  const magic = Buffer.from("TVE2", "ascii");
  const iv = Buffer.isBuffer(ivHex) ? ivHex : Buffer.from(ivHex, "hex");
  const authTag = Buffer.isBuffer(authTagHex) ? authTagHex : Buffer.from(authTagHex, "hex");

  return Buffer.concat([magic, iv, authTag, ciphertext]);
}

/**
 * Parse an envelope buffer, supporting both TVE1 and TVE2 formats.
 */
function parseEnvelope(envelopeBuffer) {
  if (!Buffer.isBuffer(envelopeBuffer) || envelopeBuffer.length < 32) {
    throw new Error("Invalid encrypted envelope format or insufficient length");
  }

  const magic = envelopeBuffer.subarray(0, 4).toString("ascii");

  if (magic === "TVE1") {
    return {
      version: 1,
      magic: "TVE1",
      ivHex: envelopeBuffer.subarray(4, 16).toString("hex"),
      authTagHex: envelopeBuffer.subarray(16, 32).toString("hex"),
      ciphertext: envelopeBuffer.subarray(32)
    };
  }

  if (magic === "TVE2") {
    return {
      version: 2,
      magic: "TVE2",
      ivHex: envelopeBuffer.subarray(4, 16).toString("hex"),
      authTagHex: envelopeBuffer.subarray(16, 32).toString("hex"),
      ciphertext: envelopeBuffer.subarray(32)
    };
  }

  throw new Error(`Unsupported envelope format magic: ${magic}`);
}

/**
 * Generate a new internal key ID: KEY-YYYY-XXXX
 */
function generateKeyId() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `KEY-${year}-${rand}`;
}

/**
 * Get active managed key from database, unwrapping its wrapped bytes.
 * If none exists, initializes KEY-DEFAULT-01 using master KEK.
 */
async function getActiveManagedKey(db) {
  const result = await db.query(
    `SELECT id, name, algorithm, status, scope, wrapped_key_bytes, created_at
     FROM encryption_keys
     WHERE status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`
  );

  let keyRecord = result.rows[0];

  if (!keyRecord) {
    // Seed default master key record
    const defaultId = "KEY-DEFAULT-01";
    const masterKek = getMasterKek();
    const wrappedDefault = wrapKey(masterKek, masterKek);

    await db.query(
      `INSERT INTO encryption_keys (id, name, algorithm, status, scope, wrapped_key_bytes, created_at)
       VALUES ($1, $2, 'AES-256-GCM', 'active', 'document', $3, NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'active'
       RETURNING id, name, algorithm, status, scope, wrapped_key_bytes, created_at`,
      [defaultId, "TrustVault Root Master Key", wrappedDefault]
    );

    return {
      id: defaultId,
      name: "TrustVault Root Master Key",
      algorithm: "AES-256-GCM",
      status: "active",
      scope: "document",
      keyBytes: masterKek
    };
  }

  let keyBytes;
  if (!keyRecord.wrapped_key_bytes) {
    // Legacy record without wrapped bytes uses master KEK directly
    keyBytes = getMasterKek();
  } else {
    try {
      keyBytes = unwrapKey(keyRecord.wrapped_key_bytes, getMasterKek());
    } catch (_err) {
      // Fallback if wrapped with itself
      keyBytes = getMasterKek();
    }
  }

  return {
    id: keyRecord.id,
    name: keyRecord.name,
    algorithm: keyRecord.algorithm,
    status: keyRecord.status,
    scope: keyRecord.scope,
    keyBytes
  };
}

/**
 * Get managed key record by ID with its key bytes unwrapped (internal use only).
 */
async function getManagedKeyBytes(db, keyId) {
  const result = await db.query(
    `SELECT id, name, algorithm, status, scope, wrapped_key_bytes
     FROM encryption_keys
     WHERE id = $1 LIMIT 1`,
    [keyId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Encryption key ${keyId} not found`);
  }

  if (row.status === "revoked") {
    const err = new Error(`Encryption key ${keyId} has been revoked`);
    err.code = "KEY_REVOKED";
    throw err;
  }

  if (!row.wrapped_key_bytes) {
    return { ...row, keyBytes: getMasterKek() };
  }

  const keyBytes = unwrapKey(row.wrapped_key_bytes, getMasterKek());
  return { ...row, keyBytes };
}

/**
 * Create a new managed key.
 * Stores wrapped key bytes; never returns raw key to the frontend.
 */
async function createManagedKey(db, { name, scope = "document", createdBy = null }) {
  const keyId = generateKeyId();
  const rawKey = generateKeyBytes();
  const masterKek = getMasterKek();
  const wrappedKeyBytes = wrapKey(rawKey, masterKek);

  const result = await db.query(
    `INSERT INTO encryption_keys
       (id, name, algorithm, status, scope, created_by, wrapped_key_bytes, created_at)
     VALUES ($1, $2, 'AES-256-GCM', 'active', $3, $4, $5, NOW())
     RETURNING id, name, algorithm, status, scope, created_by, created_at`,
    [keyId, name.trim(), scope.trim(), createdBy, wrappedKeyBytes]
  );

  return result.rows[0];
}

/**
 * Rotate a managed key.
 * Creates a replacement active key, marks old key as 'rotated',
 * and rewraps all documents associated with the old key safely in a transaction.
 */
async function rotateManagedKey(db, oldKeyId, actorId = null) {
  const oldKeyRes = await db.query(
    `SELECT id, name, algorithm, status, scope, wrapped_key_bytes
     FROM encryption_keys
     WHERE id = $1 LIMIT 1`,
    [oldKeyId]
  );

  const oldKeyRow = oldKeyRes.rows[0];
  if (!oldKeyRow) {
    throw new Error(`Key ${oldKeyId} not found`);
  }
  if (oldKeyRow.status === "revoked") {
    throw new Error(`Cannot rotate revoked key ${oldKeyId}`);
  }

  // Unwrap old key bytes to unwrap document DEKs
  let oldKeyBytes;
  if (!oldKeyRow.wrapped_key_bytes) {
    oldKeyBytes = getMasterKek();
  } else {
    oldKeyBytes = unwrapKey(oldKeyRow.wrapped_key_bytes, getMasterKek());
  }

  // Generate new active key
  const newKeyId = generateKeyId();
  const newRawKey = generateKeyBytes();
  const newWrappedKeyBytes = wrapKey(newRawKey, getMasterKek());
  const newKeyName = `${oldKeyRow.name} (Rotated ${new Date().toISOString().slice(0, 10)})`;

  // Start rotation transaction
  const client = await db.connect ? await db.connect() : db;
  const isDedicatedClient = Boolean(db.connect);

  try {
    if (isDedicatedClient) await client.query("BEGIN");

    // Insert new key
    await client.query(
      `INSERT INTO encryption_keys
         (id, name, algorithm, status, scope, created_by, wrapped_key_bytes, created_at)
       VALUES ($1, $2, 'AES-256-GCM', 'active', $3, $4, $5, NOW())`,
      [newKeyId, newKeyName, oldKeyRow.scope, actorId, newWrappedKeyBytes]
    );

    // Mark old key as rotated
    await client.query(
      `UPDATE encryption_keys
       SET status = 'rotated', rotated_at = NOW()
       WHERE id = $1`,
      [oldKeyId]
    );

    // Find all documents using oldKeyId that have a wrapped_dek
    const docsRes = await client.query(
      `SELECT id, wrapped_dek FROM documents WHERE key_id = $1`,
      [oldKeyId]
    );

    let rewrappedCount = 0;
    for (const doc of docsRes.rows) {
      if (doc.wrapped_dek) {
        // Unwrap DEK with old key
        const dek = unwrapKey(doc.wrapped_dek, oldKeyBytes);
        // Rewrap DEK with new key
        const newWrappedDek = wrapKey(dek, newRawKey);

        await client.query(
          `UPDATE documents
           SET key_id = $1, wrapped_dek = $2, updated_at = NOW()
           WHERE id = $3`,
          [newKeyId, newWrappedDek, doc.id]
        );
        rewrappedCount++;
      }
    }

    if (isDedicatedClient) await client.query("COMMIT");

    return {
      success: true,
      oldKeyId,
      newKeyId,
      rewrappedCount
    };
  } catch (err) {
    if (isDedicatedClient) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (isDedicatedClient && client.release) client.release();
  }
}

/**
 * Revoke a managed key.
 * Sets status to 'revoked'. Subsequent attempts to unwrap DEKs using this key will fail.
 */
async function revokeManagedKey(db, keyId, actorId = null) {
  const result = await db.query(
    `UPDATE encryption_keys
     SET status = 'revoked', revoked_at = NOW()
     WHERE id = $1
     RETURNING id, name, status, revoked_at`,
    [keyId]
  );

  if (!result.rows[0]) {
    throw new Error(`Key ${keyId} not found`);
  }

  return result.rows[0];
}

module.exports = {
  getMasterKek,
  generateKeyBytes,
  generateKeyId,
  wrapKey,
  unwrapKey,
  encryptDocumentWithDek,
  decryptDocumentWithDek,
  createTVE2Envelope,
  parseEnvelope,
  getActiveManagedKey,
  getManagedKeyBytes,
  createManagedKey,
  rotateManagedKey,
  revokeManagedKey,
  ALGORITHM,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_BYTES_LENGTH
};
