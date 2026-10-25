const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");
const crypto = require("crypto");
const {
  getMasterKek,
  generateKeyBytes,
  wrapKey,
  unwrapKey,
  encryptDocumentWithDek,
  decryptDocumentWithDek,
  createTVE2Envelope,
  parseEnvelope,
  createManagedKey,
  rotateManagedKey,
  revokeManagedKey,
  getActiveManagedKey
} = require("../keyManagementService");
const { encryptBuffer } = require("../encryption");
const { saveEncryptedFile, deleteEncryptedFile } = require("../storageService");

describe("TrustVault Secure Key Management & Viewer Decryption Security", () => {
  let adminAgent;
  let ownerAgent;
  let viewerAgent;
  let outsiderAgent;

  let adminUser;
  let ownerUser;
  let viewerUser;
  let outsiderUser;

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `admin-keymgmt-${unique}@example.com`;
  const ownerEmail = `owner-keymgmt-${unique}@example.com`;
  const viewerEmail = `viewer-keymgmt-${unique}@example.com`;
  const outsiderEmail = `outsider-keymgmt-${unique}@example.com`;
  const testPassword = "TrustVault-KeyTest-2026!";

  const createdDocIds = new Set();
  const createdStorageKeys = new Set();
  const createdKeyIds = new Set();

  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    return res.body.csrfToken;
  }

  async function login(agent, email) {
    const csrfToken = await getCsrfToken(agent);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ email, password: testPassword });
    expect(res.status).toBe(200);
  }

  async function postWithCsrf(agent, url, body) {
    const csrfToken = await getCsrfToken(agent);
    return agent
      .post(url)
      .set("X-CSRF-Token", csrfToken)
      .send(body);
  }

  async function deleteWithCsrf(agent, url) {
    const csrfToken = await getCsrfToken(agent);
    return agent
      .delete(url)
      .set("X-CSRF-Token", csrfToken);
  }

  async function uploadDocument(agent, filename, contentBuffer, category = "legal") {
    const csrfToken = await getCsrfToken(agent);
    const res = await agent
      .post("/api/documents")
      .set("X-CSRF-Token", csrfToken)
      .field("category", category)
      .attach("file", contentBuffer, {
        filename,
        contentType: "application/pdf"
      });

    if (res.status === 201 && res.body.document?.id) {
      createdDocIds.add(res.body.document.id);
      const row = await pool.query("SELECT storage_key FROM documents WHERE id = $1", [res.body.document.id]);
      if (row.rows[0]?.storage_key) {
        createdStorageKeys.add(row.rows[0].storage_key);
      }
    }
    return res;
  }

  beforeAll(async () => {
    const hash = await bcrypt.hash(testPassword, 10);

    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active') RETURNING id, email, role`,
      ["Test Admin Keys", adminEmail, hash]
    );
    adminUser = adminRes.rows[0];

    const ownerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'owner', 'active') RETURNING id, email, role`,
      ["Test Owner Keys", ownerEmail, hash]
    );
    ownerUser = ownerRes.rows[0];

    const viewerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'viewer', 'active') RETURNING id, email, role`,
      ["Test Viewer Keys", viewerEmail, hash]
    );
    viewerUser = viewerRes.rows[0];

    const outsiderRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'viewer', 'active') RETURNING id, email, role`,
      ["Test Outsider Keys", outsiderEmail, hash]
    );
    outsiderUser = outsiderRes.rows[0];

    adminAgent = request.agent(app);
    ownerAgent = request.agent(app);
    viewerAgent = request.agent(app);
    outsiderAgent = request.agent(app);

    await login(adminAgent, adminEmail);
    await login(ownerAgent, ownerEmail);
    await login(viewerAgent, viewerEmail);
    await login(outsiderAgent, outsiderEmail);
  });

  afterAll(async () => {
    for (const docId of createdDocIds) {
      await pool.query("DELETE FROM document_permissions WHERE document_id = $1", [docId]).catch(() => {});
      await pool.query("DELETE FROM documents WHERE id = $1", [docId]).catch(() => {});
    }
    for (const key of createdStorageKeys) {
      await deleteEncryptedFile(key).catch(() => {});
    }
    for (const keyId of createdKeyIds) {
      await pool.query("DELETE FROM encryption_keys WHERE id = $1", [keyId]).catch(() => {});
    }
    await pool.query("DELETE FROM users WHERE id IN ($1, $2, $3, $4)", [
      adminUser.id,
      ownerUser.id,
      viewerUser.id,
      outsiderUser.id
    ]).catch(() => {});
  });

  describe("1. Cryptographic Primitive Verification", () => {
    test("Cryptographically secure key generation produces 256-bit (32-byte) unique keys", () => {
      const key1 = generateKeyBytes();
      const key2 = generateKeyBytes();

      expect(Buffer.isBuffer(key1)).toBe(true);
      expect(key1.length).toBe(32);
      expect(key2.length).toBe(32);
      expect(key1.equals(key2)).toBe(false);
    });

    test("AES-256-GCM encrypt/decrypt round trip succeeds and authenticates", () => {
      const dek = generateKeyBytes();
      const plaintext = Buffer.from("Sensitive TrustVault Financial Audit Report 2026", "utf8");

      const enc = encryptDocumentWithDek(plaintext, dek);
      expect(enc.ivHex).toMatch(/^[a-f0-9]{24}$/);
      expect(enc.authTagHex).toMatch(/^[a-f0-9]{32}$/);
      expect(Buffer.isBuffer(enc.ciphertext)).toBe(true);

      const decrypted = decryptDocumentWithDek(enc.ciphertext, enc.ivHex, enc.authTagHex, dek);
      expect(decrypted.toString("utf8")).toBe(plaintext.toString("utf8"));
    });

    test("Incorrect key is rejected with authentication failure", () => {
      const dek1 = generateKeyBytes();
      const dek2 = generateKeyBytes();
      const plaintext = Buffer.from("Secret Payload", "utf8");

      const enc = encryptDocumentWithDek(plaintext, dek1);
      expect(() => {
        decryptDocumentWithDek(enc.ciphertext, enc.ivHex, enc.authTagHex, dek2);
      }).toThrow();
    });

    test("Modified ciphertext or authentication-tag is rejected (tamper resistance)", () => {
      const dek = generateKeyBytes();
      const plaintext = Buffer.from("Tamper Proof Document Content", "utf8");
      const enc = encryptDocumentWithDek(plaintext, dek);

      // 1. Modified ciphertext bit
      const tamperedCiphertext = Buffer.from(enc.ciphertext);
      tamperedCiphertext[0] ^= 0xff;
      expect(() => {
        decryptDocumentWithDek(tamperedCiphertext, enc.ivHex, enc.authTagHex, dek);
      }).toThrow();

      // 2. Modified auth tag
      const tamperedTagHex = "00" + enc.authTagHex.slice(2);
      expect(() => {
        decryptDocumentWithDek(enc.ciphertext, enc.ivHex, tamperedTagHex, dek);
      }).toThrow();
    });

    test("DEK wrapping and unwrapping with KEK preserves key bytes and verifies integrity", () => {
      const masterKek = getMasterKek();
      const dek = generateKeyBytes();

      const wrapped = wrapKey(dek, masterKek);
      expect(typeof wrapped).toBe("string");
      expect(wrapped.split(":")).toHaveLength(3);

      const unwrapped = unwrapKey(wrapped, masterKek);
      expect(unwrapped.equals(dek)).toBe(true);

      // Wrong KEK unwrapping fails
      const wrongKek = generateKeyBytes();
      expect(() => {
        unwrapKey(wrapped, wrongKek);
      }).toThrow(/authentication failed/i);
    });

    test("Existing legacy TVE1 document envelope compatibility", () => {
      const plaintext = Buffer.from("Legacy Document in TVE1 format", "utf8");
      const encrypted = encryptBuffer(plaintext);
      const tve1Envelope = Buffer.concat([
        Buffer.from("TVE1", "ascii"),
        Buffer.from(encrypted.iv, "hex"),
        Buffer.from(encrypted.authTag, "hex"),
        encrypted.ciphertext
      ]);

      const parsed = parseEnvelope(tve1Envelope);
      expect(parsed.version).toBe(1);
      expect(parsed.magic).toBe("TVE1");
      expect(parsed.ivHex).toBe(encrypted.iv);
      expect(parsed.authTagHex).toBe(encrypted.authTag);
    });

    test("TVE2 per-document envelope packing and parsing", () => {
      const ivHex = crypto.randomBytes(12).toString("hex");
      const authTagHex = crypto.randomBytes(16).toString("hex");
      const ciphertext = Buffer.from("Ciphertext bytes", "utf8");

      const envelope = createTVE2Envelope(ivHex, authTagHex, ciphertext);
      const parsed = parseEnvelope(envelope);

      expect(parsed.version).toBe(2);
      expect(parsed.magic).toBe("TVE2");
      expect(parsed.ivHex).toBe(ivHex);
      expect(parsed.authTagHex).toBe(authTagHex);
      expect(parsed.ciphertext.toString("utf8")).toBe("Ciphertext bytes");
    });
  });

  describe("2. Admin Secret Key Management API & Role Authorization", () => {
    test("Unauthorized viewer or unauthenticated user is rejected from Admin key endpoints", async () => {
      // Unauthenticated
      const unauthGet = await request(app).get("/api/admin/keys");
      expect(unauthGet.status).toBe(401);

      const unauthAgent = request.agent(app);
      const unauthCsrf = await getCsrfToken(unauthAgent);
      const unauthGen = await unauthAgent
        .post("/api/admin/keys/generate")
        .set("X-CSRF-Token", unauthCsrf)
        .send({ name: "Hacked", confirm: true });
      expect(unauthGen.status).toBe(401);

      // Viewer role
      const viewerGet = await viewerAgent.get("/api/admin/keys");
      expect(viewerGet.status).toBe(403);

      const viewerGen = await postWithCsrf(viewerAgent, "/api/admin/keys/generate", { name: "Viewer Key", confirm: true });
      expect(viewerGen.status).toBe(403);

      // Owner role
      const ownerGet = await ownerAgent.get("/api/admin/keys");
      expect(ownerGet.status).toBe(403);

      const ownerGen = await postWithCsrf(ownerAgent, "/api/admin/keys/generate", { name: "Owner Key", confirm: true });
      expect(ownerGen.status).toBe(403);
    });

    test("CSRF protection is strictly enforced on state-changing key management routes", async () => {
      const noCsrfRes = await adminAgent
        .post("/api/admin/keys/generate")
        .send({ name: "CSRF Bypass Test", confirm: true });
      expect(noCsrfRes.status).toBe(403);
    });

    test("Explicit confirmation is required to generate a key", async () => {
      const res = await postWithCsrf(adminAgent, "/api/admin/keys/generate", {
        name: "Unconfirmed Key",
        confirm: false
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/explicit confirmation is required/i);
    });

    test("Admin can successfully generate a cryptographically secure document key", async () => {
      const res = await postWithCsrf(adminAgent, "/api/admin/keys/generate", {
        name: "Q4 Finance Master Key",
        scope: "finance",
        confirm: true
      });

      expect(res.status).toBe(201);
      expect(res.body.key).toBeDefined();
      expect(res.body.key.id).toMatch(/^KEY-\d{4}-[A-Z0-9]+$/);
      expect(res.body.key.name).toBe("Q4 Finance Master Key");
      expect(res.body.key.algorithm).toBe("AES-256-GCM");
      expect(res.body.key.status).toBe("active");
      expect(res.body.key.scope).toBe("finance");
      // CRITICAL: Raw key bytes MUST NEVER be exposed in response
      expect(res.body.key.keyBytes).toBeUndefined();
      expect(res.body.key.wrapped_key_bytes).toBeUndefined();
      expect(res.body.key.rawKey).toBeUndefined();

      createdKeyIds.add(res.body.key.id);

      // Verify audit log
      const audit = await pool.query(
        "SELECT action, outcome, details FROM audit_logs WHERE action = 'key_generation' AND details->>'keyId' = $1",
        [res.body.key.id]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].outcome).toBe("success");
      // Audit details must never log secrets
      expect(JSON.stringify(audit.rows[0].details)).not.toContain("rawKey");
      expect(JSON.stringify(audit.rows[0].details)).not.toContain("wrapped");
    });

    test("Admin can list managed keys and inspect key metadata without raw keys", async () => {
      const res = await adminAgent.get("/api/admin/keys");
      expect(res.status).toBe(200);
      expect(res.body.keys).toBeInstanceOf(Array);
      expect(res.body.keys.length).toBeGreaterThanOrEqual(1);
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.activeKeys).toBeGreaterThanOrEqual(1);

      // Inspect metadata: none should contain raw key bytes
      for (const k of res.body.keys) {
        expect(k.id).toBeDefined();
        expect(k.name).toBeDefined();
        expect(k.status).toMatch(/active|rotated|revoked/);
        expect(k.keyBytes).toBeUndefined();
        expect(k.wrapped_key_bytes).toBeUndefined();
      }
    });
  });

  describe("3. Owner Document Upload with Envelope Encryption", () => {
    let uploadedDoc;

    test("Owner upload creates TVE2 envelope in storage and stores wrapped DEK in database", async () => {
      const fileContent = Buffer.from("CONFIDENTIAL OWNER CONTRACT CONTENT - ENVELOPE ENCRYPTION TEST", "utf8");
      const uploadRes = await uploadDocument(ownerAgent, "Contract_2026.pdf", fileContent, "legal");

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.document).toBeDefined();
      uploadedDoc = uploadRes.body.document;

      // Verify PostgreSQL columns
      const dbDoc = await pool.query(
        "SELECT id, storage_key, encryption_version, key_id, wrapped_dek, iv, auth_tag FROM documents WHERE id = $1",
        [uploadedDoc.id]
      );
      expect(dbDoc.rows).toHaveLength(1);
      const row = dbDoc.rows[0];

      expect(row.encryption_version).toBe(2);
      expect(row.key_id).toBeTruthy();
      expect(row.wrapped_dek).toBeTruthy();
      expect(row.wrapped_dek.split(":")).toHaveLength(3); // iv:tag:cipher
      expect(row.iv).toMatch(/^[a-f0-9]{24}$/);
      expect(row.auth_tag).toMatch(/^[a-f0-9]{32}$/);

      // Verify that stored database values DO NOT contain plaintext DEK
      expect(row.wrapped_dek).not.toContain(fileContent.toString("hex"));

      // Verify Supabase / local physical storage holds binary TVE2 envelope
      const { readEncryptedFile } = require("../storageService");
      const storedEnvelope = await readEncryptedFile(row.storage_key);
      expect(storedEnvelope.subarray(0, 4).toString("ascii")).toBe("TVE2");
      // Ciphertext does NOT contain plaintext
      expect(storedEnvelope.includes(fileContent)).toBe(false);
    });
  });

  describe("4. Viewer-Side Decryption & Document Access Management", () => {
    let testDoc;
    const documentSecret = "SECRET_VIEWER_DECRYPTION_PAYLOAD_VERIFIED_100%";

    beforeAll(async () => {
      const fileContent = Buffer.from(documentSecret, "utf8");
      const res = await uploadDocument(ownerAgent, "Confidential_Viewer_Report.pdf", fileContent, "financial");
      expect(res.status).toBe(201);
      testDoc = res.body.document;
    });

    test("Unassigned Viewer is denied preview-package (404/403)", async () => {
      const res = await viewerAgent.get(`/api/documents/${testDoc.id}/preview-package`);
      expect(res.status).toBe(404);
      expect(res.body.dek).toBeUndefined();
    });

    test("Owner or Admin can grant access to Viewer via /api/documents/:id/access", async () => {
      const grantRes = await postWithCsrf(ownerAgent, `/api/documents/${testDoc.id}/access`, {
        viewerId: viewerUser.id,
        permission: "read"
      });

      expect(grantRes.status).toBe(200);
      expect(grantRes.body.permission.permission).toBe("read");
      expect(grantRes.body.permission.user_id).toBe(viewerUser.id);
    });

    test("Assigned Viewer can fetch preview-package with unwrapped DEK and decrypt correctly", async () => {
      const res = await viewerAgent.get(`/api/documents/${testDoc.id}/preview-package`);

      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.body.id).toBe(testDoc.id);
      expect(res.body.encryptionVersion).toBe(2);
      expect(res.body.dek).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.iv).toMatch(/^[a-f0-9]{24}$/);
      expect(res.body.authTag).toMatch(/^[a-f0-9]{32}$/);
      expect(res.body.ciphertext).toBeDefined();

      // Perform in-browser equivalent decryption using the released package:
      const dekBytes = Buffer.from(res.body.dek, "hex");
      const ciphertextBytes = Buffer.from(res.body.ciphertext, "base64");
      const decrypted = decryptDocumentWithDek(ciphertextBytes, res.body.iv, res.body.authTag, dekBytes);

      expect(decrypted.toString("utf8")).toBe(documentSecret);

      // Verify audit log recorded key_release
      const audit = await pool.query(
        "SELECT action, outcome, details FROM audit_logs WHERE action = 'key_release' AND document_id = $1 ORDER BY created_at DESC LIMIT 1",
        [testDoc.id]
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].outcome).toBe("success");
      expect(audit.rows[0].details.keyId).toBeDefined();
    });

    test("Cross-tenant user / outsider is strictly denied key-release and preview package", async () => {
      const res = await outsiderAgent.get(`/api/documents/${testDoc.id}/preview-package`);
      expect(res.status).toBe(404);
      expect(res.body.dek).toBeUndefined();
    });

    test("Revoking access via DELETE /api/documents/:id/access/:viewerId immediately denies viewer", async () => {
      const revokeRes = await deleteWithCsrf(ownerAgent, `/api/documents/${testDoc.id}/access/${viewerUser.id}`);
      expect(revokeRes.status).toBe(200);

      const deniedRes = await viewerAgent.get(`/api/documents/${testDoc.id}/preview-package`);
      expect(deniedRes.status).toBe(404);
    });
  });

  describe("5. Key Rotation & Key Revocation Enforcement", () => {
    let rotationDoc;
    let initialKeyId;
    const rotationPayload = "DOCUMENT SECURED ACROSS ROTATION LIFECYCLE 2026";

    beforeAll(async () => {
      // 1. Generate dedicated key
      const keyGen = await postWithCsrf(adminAgent, "/api/admin/keys/generate", {
        name: "Rotation Test Key",
        scope: "document",
        confirm: true
      });
      expect(keyGen.status).toBe(201);
      initialKeyId = keyGen.body.key.id;
      createdKeyIds.add(initialKeyId);

      // 2. Upload document using this active key
      const uploadRes = await uploadDocument(ownerAgent, "Pre_Rotation_Doc.pdf", Buffer.from(rotationPayload, "utf8"));
      expect(uploadRes.status).toBe(201);
      rotationDoc = uploadRes.body.document;

      // Assign viewer
      await postWithCsrf(ownerAgent, `/api/documents/${rotationDoc.id}/access`, {
        viewerId: viewerUser.id,
        permission: "read"
      });
    });

    test("Key rotation rewraps document DEKs without data loss", async () => {
      // Get preview package before rotation
      const preRes = await viewerAgent.get(`/api/documents/${rotationDoc.id}/preview-package`);
      expect(preRes.status).toBe(200);
      const preDek = preRes.body.dek;

      // Rotate initial key
      const rotateRes = await postWithCsrf(adminAgent, `/api/admin/keys/${initialKeyId}/rotate`, {
        confirm: true
      });
      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.oldKeyId).toBe(initialKeyId);
      expect(rotateRes.body.newKeyId).toBeDefined();
      expect(rotateRes.body.rewrappedCount).toBeGreaterThanOrEqual(1);

      createdKeyIds.add(rotateRes.body.newKeyId);

      // Verify old key is marked rotated
      const oldKeyDb = await pool.query("SELECT status, rotated_at FROM encryption_keys WHERE id = $1", [initialKeyId]);
      expect(oldKeyDb.rows[0].status).toBe("rotated");
      expect(oldKeyDb.rows[0].rotated_at).toBeTruthy();

      // Verify document was updated to new key_id
      const docDb = await pool.query("SELECT key_id, wrapped_dek FROM documents WHERE id = $1", [rotationDoc.id]);
      expect(docDb.rows[0].key_id).toBe(rotateRes.body.newKeyId);

      // Verify viewer can still decrypt document with zero data loss!
      const postRes = await viewerAgent.get(`/api/documents/${rotationDoc.id}/preview-package`);
      expect(postRes.status).toBe(200);
      expect(postRes.body.keyId).toBe(rotateRes.body.newKeyId);
      expect(postRes.body.dek).toBe(preDek); // DEK remains consistent, safely rewrapped

      const decrypted = decryptDocumentWithDek(
        Buffer.from(postRes.body.ciphertext, "base64"),
        postRes.body.iv,
        postRes.body.authTag,
        Buffer.from(postRes.body.dek, "hex")
      );
      expect(decrypted.toString("utf8")).toBe(rotationPayload);
    });

    test("Revoking a key immediately prevents key unwrapping and viewer decryption", async () => {
      // Fetch currently assigned key for rotationDoc
      const docDb = await pool.query("SELECT key_id FROM documents WHERE id = $1", [rotationDoc.id]);
      const currentKeyId = docDb.rows[0].key_id;

      // Revoke the key
      const revokeRes = await postWithCsrf(adminAgent, `/api/admin/keys/${currentKeyId}/revoke`, {
        confirm: true,
        reason: "Security decommission test"
      });
      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.key.status).toBe("revoked");

      // Attempting to fetch preview package must fail with 403 Forbidden!
      const blockedPreviewPkg = await viewerAgent.get(`/api/documents/${rotationDoc.id}/preview-package`);
      expect(blockedPreviewPkg.status).toBe(403);
      expect(blockedPreviewPkg.body.error).toMatch(/revoked/i);

      // Direct server-side preview must also be blocked
      const blockedPreview = await viewerAgent.get(`/api/documents/${rotationDoc.id}/preview`);
      expect(blockedPreview.status).toBe(403);
      expect(blockedPreview.body.error).toMatch(/revoked/i);
    });
  });

  describe("6. Confidentiality & Non-Exposure Guarantees", () => {
    test("Database records, audit logs, and API responses never expose plaintext DEKs or KEK", async () => {
      // 1. Database documents table
      const docRows = await pool.query("SELECT wrapped_dek FROM documents WHERE wrapped_dek IS NOT NULL LIMIT 10");
      for (const row of docRows.rows) {
        expect(row.wrapped_dek).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      }

      // 2. Database encryption_keys table
      const keyRows = await pool.query("SELECT wrapped_key_bytes FROM encryption_keys WHERE wrapped_key_bytes IS NOT NULL");
      for (const row of keyRows.rows) {
        expect(row.wrapped_key_bytes).toMatch(/^[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      }

      // 3. Audit logs table
      const auditRows = await pool.query("SELECT details FROM audit_logs WHERE action IN ('key_generation', 'key_rotation', 'key_release')");
      for (const row of auditRows.rows) {
        const str = JSON.stringify(row.details);
        expect(str).not.toContain("wrapped_key_bytes");
        expect(str).not.toContain(process.env.FILE_ENCRYPTION_KEY);
      }

      // 4. Admin keys API response
      const keysRes = await adminAgent.get("/api/admin/keys");
      const bodyStr = JSON.stringify(keysRes.body);
      expect(bodyStr).not.toContain(process.env.FILE_ENCRYPTION_KEY);
      expect(bodyStr).not.toContain("wrapped_key_bytes");
    });
  });
});
