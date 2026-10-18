
const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");
const fs = require("fs/promises");
const path = require("path");

describe("TrustVault document authorization security", () => {
  let owner;
  let viewer;
  let documentId;
  let uploadedDocumentId;
  let missingFileDocumentId;
  let ownerAgent;
  let viewerAgent;

  const unique = `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  const ownerEmail = `tv-owner-${unique}@example.com`;
  const viewerEmail = `tv-viewer-${unique}@example.com`;
  const testPassword = "TrustVault-Test-Password-2026!";

  const createdDocumentIds = new Set();
  const createdStorageKeys = new Set();

  
async function getCsrfToken(agent) {
  const response = await agent.get("/api/auth/csrf-token");

  expect(response.status).toBe(200);
  expect(response.body.csrfToken).toBeTruthy();

  return response.body.csrfToken;
}


  async function login(agent, email) {
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({
        email,
        password: testPassword
      });
  }

  
async function postWithCsrf(agent, url, body) {
  const token = await getCsrfToken(agent);

  const response = await agent
    .post(url)
    .set("X-CSRF-Token", token)
    .send(body);

  return response;
}


  async function deleteWithCsrf(agent, url) {
    const csrfToken = await getCsrfToken(agent);

    return agent
      .delete(url)
      .set("X-CSRF-Token", csrfToken);
  }

  async function uploadWithCsrf(agent, filename, contents, contentType) {
    const csrfToken = await getCsrfToken(agent);

    return agent
      .post("/api/documents")
      .set("X-CSRF-Token", csrfToken)
      .field("category", "security-test")
      .attach("file", contents, {
        filename,
        contentType
      });
  }

  // Preserve binary response bytes for encrypted downloads.
  function parseBinaryResponse(response, callback) {
    const chunks = [];

    response.on("data", (chunk) => {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      );
    });

    response.on("end", () => {
      callback(null, Buffer.concat(chunks));
    });

    response.on("error", callback);
  }

  async function trackUploadedDocument(response) {
    if (response.status !== 201 || !response.body.document?.id) {
      return;
    }

    const id = response.body.document.id;
    createdDocumentIds.add(String(id));

    const result = await pool.query(
      "SELECT storage_key FROM documents WHERE id = $1",
      [id]
    );

    if (result.rows[0]?.storage_key) {
      createdStorageKeys.add(result.rows[0].storage_key);
    }
  }

  async function getStorageKey(id) {
    const result = await pool.query(
      "SELECT storage_key FROM documents WHERE id = $1",
      [id]
    );

    expect(result.rows).toHaveLength(1);
    return result.rows[0].storage_key;
  }

  function storagePathForTest(key) {
    if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
      throw new Error("Refusing to use an invalid test storage key");
    }

    return path.join(__dirname, "..", "storage", key);
  }

  async function removeTestStorageFiles() {
    for (const key of createdStorageKeys) {
      if (!/^[a-f0-9]{64}$/.test(key)) {
        continue;
      }

      await fs.unlink(storagePathForTest(key)).catch((error) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
      });
    }
  }

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testPassword, 12);

    const ownerResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('TrustVault Test Owner', $1, $2, 'owner')
       RETURNING id, email`,
      [ownerEmail, passwordHash]
    );

    owner = ownerResult.rows[0];

    const viewerResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('TrustVault Test Viewer', $1, $2, 'viewer')
       RETURNING id, email`,
      [viewerEmail, passwordHash]
    );

    viewer = viewerResult.rows[0];

    const documentResult = await pool.query(
      `INSERT INTO documents
         (owner_id, name, category, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, 'test', $3, 'text/plain', 10)
       RETURNING id`,
      [
        owner.id,
        `Security test document ${unique}`,
        `test-storage-key-${unique}`
      ]
    );

    documentId = documentResult.rows[0].id;

    ownerAgent = request.agent(app);
    viewerAgent = request.agent(app);

    await login(ownerAgent, ownerEmail);
    await login(viewerAgent, viewerEmail);
  });

  afterAll(async () => {
    try {
      await removeTestStorageFiles();

      const testUserIds = [owner?.id, viewer?.id].filter(Boolean);

      if (testUserIds.length > 0) {
        await pool.query(
          `DELETE FROM audit_logs
           WHERE actor_id = ANY($1::bigint[])
              OR target_user_id = ANY($1::bigint[])`,
          [testUserIds]
        );
      }

      const idsToDelete = [
        ...createdDocumentIds,
        ...(documentId ? [String(documentId)] : [])
      ];

      if (idsToDelete.length > 0) {
        await pool.query(
          "DELETE FROM documents WHERE id = ANY($1::bigint[])",
          [idsToDelete]
        );
      }

      if (testUserIds.length > 0) {
        await pool.query(
          "DELETE FROM users WHERE id = ANY($1::bigint[])",
          [testUserIds]
        );
      }
    } finally {
      await pool.end();
    }
  });

  // --------------------------------------------------
  // Permission authorization tests
  // --------------------------------------------------

  test("User B cannot access User A's private document", async () => {
    const response = await viewerAgent.get(
      `/api/documents/${documentId}`
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Document not found"
    });

    const audit = await pool.query(
      `SELECT outcome
       FROM audit_logs
       WHERE actor_id = $1
         AND action = 'document_read'
         AND document_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [viewer.id, documentId]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("denied");
  });

  test("Owner can grant read permission to User B", async () => {
    const response = await postWithCsrf(
      ownerAgent,
      `/api/documents/${documentId}/permissions`,
      {
        email: viewerEmail,
        permission: "read"
      }
    );

    expect(response.status).toBe(200);
    expect(response.body.permission.permission).toBe("read");
    expect(String(response.body.permission.user_id)).toBe(
      String(viewer.id)
    );
  });

  test("User B can read metadata after permission is granted", async () => {
    const response = await viewerAgent.get(
      `/api/documents/${documentId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.document.name).toContain(
      "Security test document"
    );
    expect(response.body.document.access_level).toBe("read");
  });

  test("Owner can revoke User B's permission", async () => {
    const response = await deleteWithCsrf(
      ownerAgent,
      `/api/documents/${documentId}/permissions/${viewer.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Permission revoked"
    });
  });

  test("User B loses access after permission is revoked", async () => {
    const response = await viewerAgent.get(
      `/api/documents/${documentId}`
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Document not found"
    });
  });

  test("Permission grant and revoke actions are audited", async () => {
    const result = await pool.query(
      `SELECT action, outcome, target_user_id
       FROM audit_logs
       WHERE actor_id = $1
         AND document_id = $2
         AND action IN ('permission_grant', 'permission_revoke')
       ORDER BY id`,
      [owner.id, documentId]
    );

    expect(
      result.rows.some(
        (row) =>
          row.action === "permission_grant" &&
          row.outcome === "success" &&
          String(row.target_user_id) === String(viewer.id)
      )
    ).toBe(true);

    expect(
      result.rows.some(
        (row) =>
          row.action === "permission_revoke" &&
          row.outcome === "success" &&
          String(row.target_user_id) === String(viewer.id)
      )
    ).toBe(true);
  });

  // --------------------------------------------------
  // Upload and encryption tests
  // --------------------------------------------------

  test("Owner upload stores encrypted data in private storage", async () => {
    const contents = Buffer.from(
      `TrustVault upload security test ${unique}`,
      "utf8"
    );

    const response = await uploadWithCsrf(
      ownerAgent,
      `upload-${unique}.txt`,
      contents,
      "text/plain"
    );

    expect(response.status).toBe(201);
    expect(response.body.document).toBeDefined();
    expect(response.body.document.name).toBe(`upload-${unique}.txt`);
    expect(response.body.document.access_level).toBe("owner");
    expect(response.body.document.storage_key).toBeUndefined();

    uploadedDocumentId = response.body.document.id;
    await trackUploadedDocument(response);

    const saved = await pool.query(
      `SELECT id, owner_id, storage_key, size_bytes
       FROM documents
       WHERE id = $1`,
      [uploadedDocumentId]
    );

    expect(saved.rows).toHaveLength(1);
    expect(String(saved.rows[0].owner_id)).toBe(String(owner.id));
    expect(saved.rows[0].storage_key).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(saved.rows[0].size_bytes)).toBe(contents.length);

    const storedContents = await fs.readFile(
      storagePathForTest(saved.rows[0].storage_key)
    );

    expect(storedContents.subarray(0, 4).toString("ascii")).toBe("TVE1");
    expect(storedContents.equals(contents)).toBe(false);
  });

  test("Viewer without permission cannot download owner's document", async () => {
    const contents = Buffer.from(`Private file ${unique}`, "utf8");

    const uploadResponse = await uploadWithCsrf(
      ownerAgent,
      `private-${unique}.txt`,
      contents,
      "text/plain"
    );

    expect(uploadResponse.status).toBe(201);
    await trackUploadedDocument(uploadResponse);

    const privateDocumentId = uploadResponse.body.document.id;

    const downloadResponse = await viewerAgent.get(
      `/api/documents/${privateDocumentId}/download`
    );

    expect(downloadResponse.status).toBe(404);
  });

  test("Viewer can download decrypted content after read permission is granted", async () => {
    const contents = Buffer.from(
      `Authorized download ${unique}`,
      "utf8"
    );

    const uploadResponse = await uploadWithCsrf(
      ownerAgent,
      `shared-${unique}.txt`,
      contents,
      "text/plain"
    );

    expect(uploadResponse.status).toBe(201);
    await trackUploadedDocument(uploadResponse);

    const sharedId = uploadResponse.body.document.id;

    const grantResponse = await postWithCsrf(
      ownerAgent,
      `/api/documents/${sharedId}/permissions`,
      {
        email: viewerEmail,
        permission: "read"
      }
    );

    expect(grantResponse.status).toBe(200);

    const downloadResponse = await viewerAgent
      .get(`/api/documents/${sharedId}/download`)
      .buffer(true)
      .parse(parseBinaryResponse);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers["content-disposition"]).toContain(
      "attachment"
    );
    expect(downloadResponse.headers["x-content-type-options"]).toBe(
      "nosniff"
    );
    expect(Buffer.isBuffer(downloadResponse.body)).toBe(true);
    expect(downloadResponse.body.equals(contents)).toBe(true);
  });

  test("Tampered encrypted file is rejected and audited", async () => {
    const contents = Buffer.from(
      `Tamper detection test ${unique}`,
      "utf8"
    );

    const uploadResponse = await uploadWithCsrf(
      ownerAgent,
      `tamper-${unique}.txt`,
      contents,
      "text/plain"
    );

    expect(uploadResponse.status).toBe(201);
    await trackUploadedDocument(uploadResponse);

    const tamperedId = uploadResponse.body.document.id;
    const key = await getStorageKey(tamperedId);
    const filePath = storagePathForTest(key);

    const encrypted = await fs.readFile(filePath);

    expect(encrypted.subarray(0, 4).toString("ascii")).toBe("TVE1");
    expect(encrypted.length).toBeGreaterThan(32);

    encrypted[encrypted.length - 1] ^= 0x01;
    await fs.writeFile(filePath, encrypted);

    const downloadResponse = await ownerAgent.get(
      `/api/documents/${tamperedId}/download`
    );

    expect(downloadResponse.status).toBe(500);
    expect(downloadResponse.body).toEqual({
      error: "File integrity verification failed"
    });

    const audit = await pool.query(
      `SELECT outcome, details
       FROM audit_logs
       WHERE actor_id = $1
         AND action = 'document_download'
         AND document_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [owner.id, tamperedId]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("failure");
    expect(audit.rows[0].details.reason).toBe(
      "Encrypted file authentication failed"
    );
  });

  test("Upload rejects files larger than 10 MB", async () => {
    const oversizedContents = Buffer.alloc(
      10 * 1024 * 1024 + 1,
      "x"
    );

    const response = await uploadWithCsrf(
      ownerAgent,
      `oversized-${unique}.txt`,
      oversizedContents,
      "text/plain"
    );

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "File exceeds the 10 MB limit"
    });
  });

  test("Successful upload is audited", async () => {
    expect(uploadedDocumentId).toBeTruthy();

    const result = await pool.query(
      `SELECT outcome
       FROM audit_logs
       WHERE actor_id = $1
         AND document_id = $2
         AND action = 'document_upload'
       ORDER BY id DESC
       LIMIT 1`,
      [owner.id, uploadedDocumentId]
    );

    expect(result.rows[0]?.outcome).toBe("success");
  });

  // --------------------------------------------------
  // Download authorization hardening
  // --------------------------------------------------

  test("Unauthorized download attempts are recorded as denied", async () => {
    const response = await viewerAgent.get(
      `/api/documents/${documentId}/download`
    );

    expect(response.status).toBe(404);

    const audit = await pool.query(
      `SELECT outcome
       FROM audit_logs
       WHERE actor_id = $1
         AND action = 'document_download'
         AND document_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [viewer.id, documentId]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("denied");
  });

  test("Revoked user cannot download a previously shared document", async () => {
    expect(uploadedDocumentId).toBeTruthy();

    const grantResponse = await postWithCsrf(
      ownerAgent,
      `/api/documents/${uploadedDocumentId}/permissions`,
      {
        email: viewerEmail,
        permission: "read"
      }
    );

    expect(grantResponse.status).toBe(200);

    const allowedResponse = await viewerAgent
      .get(`/api/documents/${uploadedDocumentId}/download`)
      .buffer(true)
      .parse(parseBinaryResponse);

    expect(allowedResponse.status).toBe(200);

    const revokeResponse = await deleteWithCsrf(
      ownerAgent,
      `/api/documents/${uploadedDocumentId}/permissions/${viewer.id}`
    );

    expect(revokeResponse.status).toBe(200);
    expect(revokeResponse.body).toEqual({
      message: "Permission revoked"
    });

    const deniedResponse = await viewerAgent.get(
      `/api/documents/${uploadedDocumentId}/download`
    );

    expect(deniedResponse.status).toBe(404);

    const audit = await pool.query(
      `SELECT outcome
       FROM audit_logs
       WHERE actor_id = $1
         AND action = 'document_download'
         AND document_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [viewer.id, uploadedDocumentId]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("denied");
  });

  // --------------------------------------------------
  // Missing-file handling and audit verification
  // --------------------------------------------------

  test("Missing stored file returns 404 without crashing the server", async () => {
    const contents = Buffer.from(
      `Missing file security test ${unique}`,
      "utf8"
    );

    const uploadResponse = await uploadWithCsrf(
      ownerAgent,
      `missing-file-${unique}.txt`,
      contents,
      "text/plain"
    );

    expect(uploadResponse.status).toBe(201);
    await trackUploadedDocument(uploadResponse);

    missingFileDocumentId = uploadResponse.body.document.id;

    const storageKey = await getStorageKey(missingFileDocumentId);
    await fs.unlink(storagePathForTest(storageKey));

    const response = await ownerAgent.get(
      `/api/documents/${missingFileDocumentId}/download`
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "File not found"
    });
  });

  test("Missing-file download failure is recorded in the audit log", async () => {
    expect(missingFileDocumentId).toBeTruthy();

    const audit = await pool.query(
      `SELECT outcome, details
       FROM audit_logs
       WHERE actor_id = $1
         AND action = 'document_download'
         AND document_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [owner.id, missingFileDocumentId]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("failure");
    expect(audit.rows[0].details.reason).toBe("Stored file missing");
  });

  // --------------------------------------------------
  // SQL injection security test
  // --------------------------------------------------

  test("SQL injection attempt cannot bypass login authentication", async () => {
    const attackerAgent = request.agent(app);
    const csrfToken = await getCsrfToken(attackerAgent);

    const response = await attackerAgent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({
        email: ownerEmail,
        password: "' OR '1'='1' --"
      });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty("user");

    const meResponse = await attackerAgent.get("/api/auth/me");

    expect(meResponse.status).toBe(401);
    expect(meResponse.body).not.toHaveProperty("user");
  });
});
