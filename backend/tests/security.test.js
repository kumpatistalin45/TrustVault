const request = require("supertest");
const bcrypt = require("bcrypt");
const fs = require("fs/promises");
const path = require("path");
const app = require("../server");
const pool = require("../db");

describe("TrustVault Roles, Permissions, Search & Audit Security", () => {
  let adminUser;
  let ownerUser;
  let viewerUser;
  let editorUser;
  let outsiderUser;

  let adminAgent;
  let ownerAgent;
  let viewerAgent;
  let editorAgent;
  let outsiderAgent;

  let testDocId;

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testPassword = "SecurityTestPassword2026!";

  const createdUserIds = new Set();
  const createdDocIds = new Set();
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
      .send({ email, password: testPassword });
    expect(response.status).toBe(200);
  }

  async function postWithCsrf(agent, url, body) {
    const token = await getCsrfToken(agent);
    return agent
      .post(url)
      .set("X-CSRF-Token", token)
      .send(body);
  }

  async function patchWithCsrf(agent, url, body) {
    const token = await getCsrfToken(agent);
    return agent
      .patch(url)
      .set("X-CSRF-Token", token)
      .send(body);
  }

  async function deleteWithCsrf(agent, url) {
    const token = await getCsrfToken(agent);
    return agent
      .delete(url)
      .set("X-CSRF-Token", token);
  }

  async function uploadFile(agent, filename, contents, category = "security") {
    const token = await getCsrfToken(agent);
    return agent
      .post("/api/documents")
      .set("X-CSRF-Token", token)
      .field("category", category)
      .attach("file", contents, { filename });
  }

  function storagePath(key) {
    return path.join(__dirname, "..", "storage", key);
  }

  const originalProvider = process.env.STORAGE_PROVIDER;
  beforeAll(async () => {
    process.env.STORAGE_PROVIDER = "local";
    const passwordHash = await bcrypt.hash(testPassword, 12);

    // 1. Create Admin User
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Security Admin', $1, $2, 'admin')
       RETURNING id, email`,
      [`admin-${unique}@example.com`, passwordHash]
    );
    adminUser = adminRes.rows[0];
    createdUserIds.add(adminUser.id);

    // 2. Create Owner User
    const ownerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Document Owner', $1, $2, 'owner')
       RETURNING id, email`,
      [`owner-${unique}@example.com`, passwordHash]
    );
    ownerUser = ownerRes.rows[0];
    createdUserIds.add(ownerUser.id);

    // 3. Create Viewer User
    const viewerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Read-Only Viewer', $1, $2, 'viewer')
       RETURNING id, email`,
      [`viewer-${unique}@example.com`, passwordHash]
    );
    viewerUser = viewerRes.rows[0];
    createdUserIds.add(viewerUser.id);

    // 4. Create Editor User
    const editorRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Document Editor', $1, $2, 'owner')
       RETURNING id, email`,
      [`editor-${unique}@example.com`, passwordHash]
    );
    editorUser = editorRes.rows[0];
    createdUserIds.add(editorUser.id);

    // 5. Create Outsider User (Unrelated third party)
    const outsiderRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Outsider User', $1, $2, 'owner')
       RETURNING id, email`,
      [`outsider-${unique}@example.com`, passwordHash]
    );
    outsiderUser = outsiderRes.rows[0];
    createdUserIds.add(outsiderUser.id);

    // Initialize authenticated agents
    adminAgent = request.agent(app);
    ownerAgent = request.agent(app);
    viewerAgent = request.agent(app);
    editorAgent = request.agent(app);
    outsiderAgent = request.agent(app);

    await login(adminAgent, adminUser.email);
    await login(ownerAgent, ownerUser.email);
    await login(viewerAgent, viewerUser.email);
    await login(editorAgent, editorUser.email);
    await login(outsiderAgent, outsiderUser.email);

    // Owner uploads a base test document
    const uploadRes = await uploadFile(
      ownerAgent,
      `doc-base-${unique}.txt`,
      Buffer.from(`Base document content for security tests ${unique}`, "utf8"),
      "security-ops"
    );
    expect(uploadRes.status).toBe(201);
    testDocId = uploadRes.body.document.id;
    createdDocIds.add(String(testDocId));

    const keyRes = await pool.query(
      "SELECT storage_key FROM documents WHERE id = $1",
      [testDocId]
    );
    if (keyRes.rows[0]?.storage_key) {
      createdStorageKeys.add(keyRes.rows[0].storage_key);
    }
  });

  afterAll(async () => {
    try {
      // Clean up physical storage files
      for (const key of createdStorageKeys) {
        if (/^[a-f0-9]{64}$/.test(key)) {
          await fs.unlink(storagePath(key)).catch(() => {});
        }
      }

      const userIds = Array.from(createdUserIds);
      if (userIds.length > 0) {
        await pool.query(
          `DELETE FROM audit_logs
           WHERE actor_id = ANY($1::bigint[])
              OR target_user_id = ANY($1::bigint[])`,
          [userIds]
        );
      }

      const docIds = Array.from(createdDocIds);
      if (docIds.length > 0) {
        await pool.query(
          "DELETE FROM documents WHERE id = ANY($1::bigint[])",
          [docIds]
        );
      }

      if (userIds.length > 0) {
        await pool.query(
          "DELETE FROM users WHERE id = ANY($1::bigint[])",
          [userIds]
        );
      }
      process.env.STORAGE_PROVIDER = originalProvider;
    } finally {
      await pool.end();
    }
  });

  // --------------------------------------------------
  // 1. Admin Role & Audit Log Access Controls
  // --------------------------------------------------

  test("Non-admin user cannot access admin audit logs and attempt is audited", async () => {
    const response = await ownerAgent.get("/api/admin/audit-logs");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Admin access required"
    });

    const audit = await pool.query(
      `SELECT action, outcome, actor_id
       FROM audit_logs
       WHERE actor_id = $1
         AND action = 'admin_audit_logs_read'
       ORDER BY id DESC LIMIT 1`,
      [ownerUser.id]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("denied");
  });

  test("Admin user can access admin audit logs with filtering and pagination", async () => {
    const response = await adminAgent.get("/api/admin/audit-logs?limit=50&offset=0");

    expect(response.status).toBe(200);
    expect(response.body.auditLogs).toBeInstanceOf(Array);
    expect(response.body.auditLogs.length).toBeGreaterThan(0);

    const first = response.body.auditLogs[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("action");
    expect(first).toHaveProperty("outcome");
    expect(first).toHaveProperty("created_at");

    // Admin audit read is recorded
    const adminAudit = await pool.query(
      `SELECT outcome
       FROM audit_logs
       WHERE actor_id = $1 AND action = 'admin_audit_logs_read'
       ORDER BY id DESC LIMIT 1`,
      [adminUser.id]
    );
    expect(adminAudit.rows[0]?.outcome).toBe("success");
  });

  // --------------------------------------------------
  // 2. Viewer Role Platform Restriction
  // --------------------------------------------------

  test("User with viewer role cannot upload documents", async () => {
    const contents = Buffer.from("Viewer attempt content", "utf8");
    const response = await uploadFile(
      viewerAgent,
      `viewer-forbidden-${unique}.txt`,
      contents
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Viewers cannot upload documents"
    });

    const audit = await pool.query(
      `SELECT outcome, details
       FROM audit_logs
       WHERE actor_id = $1 AND action = 'document_upload'
       ORDER BY id DESC LIMIT 1`,
      [viewerUser.id]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("denied");
  });

  // --------------------------------------------------
  // 3. Read vs Edit Permission Enforcement
  // --------------------------------------------------

  test("Read permission permits metadata reading and download, but denies metadata edit and deletion", async () => {
    // 1. Grant read permission to viewerUser
    const grantRes = await postWithCsrf(
      ownerAgent,
      `/api/documents/${testDocId}/permissions`,
      {
        email: viewerUser.email,
        permission: "read"
      }
    );
    expect(grantRes.status).toBe(200);
    expect(grantRes.body.permission.permission).toBe("read");

    // 2. Viewer can view metadata
    const metaRes = await viewerAgent.get(`/api/documents/${testDocId}`);
    expect(metaRes.status).toBe(200);
    expect(metaRes.body.document.access_level).toBe("read");

    // 3. Viewer can preview file in-app, while removed download returns 404
    const previewRes = await viewerAgent.get(`/api/documents/${testDocId}/preview`);
    expect(previewRes.status).toBe(200);

    const downloadRes = await viewerAgent.get(`/api/documents/${testDocId}/download`);
    expect(downloadRes.status).toBe(404);

    // 4. Viewer CANNOT edit metadata (PATCH)
    const patchRes = await patchWithCsrf(
      viewerAgent,
      `/api/documents/${testDocId}`,
      { name: "Unauthorized Metadata Update" }
    );
    expect(patchRes.status).toBe(404);
    expect(patchRes.body).toEqual({ error: "Document not found" });

    // 5. Viewer CANNOT delete document (DELETE)
    const deleteRes = await deleteWithCsrf(
      viewerAgent,
      `/api/documents/${testDocId}`
    );
    expect(deleteRes.status).toBe(404);

    // 6. Viewer CANNOT grant permissions to third party
    const shareRes = await postWithCsrf(
      viewerAgent,
      `/api/documents/${testDocId}/permissions`,
      {
        email: outsiderUser.email,
        permission: "read"
      }
    );
    expect(shareRes.status).toBe(404);
  });

  test("Edit permission permits metadata editing, but denies deletion and permission management", async () => {
    // 1. Grant edit permission to editorUser
    const grantRes = await postWithCsrf(
      ownerAgent,
      `/api/documents/${testDocId}/permissions`,
      {
        email: editorUser.email,
        permission: "edit"
      }
    );
    expect(grantRes.status).toBe(200);
    expect(grantRes.body.permission.permission).toBe("edit");

    // 2. Editor CAN edit metadata (PATCH)
    const newName = `edited-name-${unique}.txt`;
    const patchRes = await patchWithCsrf(
      editorAgent,
      `/api/documents/${testDocId}`,
      { name: newName, category: "updated-category" }
    );
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.document.name).toBe(newName);
    expect(patchRes.body.document.category).toBe("updated-category");

    // 3. Editor CANNOT delete document (DELETE)
    const deleteRes = await deleteWithCsrf(
      editorAgent,
      `/api/documents/${testDocId}`
    );
    expect(deleteRes.status).toBe(404);

    // 4. Editor CANNOT grant permissions to others
    const grantByEditor = await postWithCsrf(
      editorAgent,
      `/api/documents/${testDocId}/permissions`,
      {
        email: outsiderUser.email,
        permission: "read"
      }
    );
    expect(grantByEditor.status).toBe(404);
  });

  // --------------------------------------------------
  // 4. Permission Listing (Owner Only)
  // --------------------------------------------------

  test("Owner can list document permissions, but non-owner is denied", async () => {
    // Owner can view permissions list
    const ownerListRes = await ownerAgent.get(`/api/documents/${testDocId}/permissions`);
    expect(ownerListRes.status).toBe(200);
    expect(ownerListRes.body.permissions).toBeInstanceOf(Array);
    expect(ownerListRes.body.permissions.length).toBeGreaterThanOrEqual(2);

    // Outsider cannot view permissions
    const outsiderListRes = await outsiderAgent.get(`/api/documents/${testDocId}/permissions`);
    expect(outsiderListRes.status).toBe(404);
    expect(outsiderListRes.body).toEqual({ error: "Document not found" });

    // Viewer cannot view permissions
    const viewerListRes = await viewerAgent.get(`/api/documents/${testDocId}/permissions`);
    expect(viewerListRes.status).toBe(404);
  });

  // --------------------------------------------------
  // 5. Cross-User IDOR Protection
  // --------------------------------------------------

  test("Outsider cannot access private document across read, update, download, delete, and share", async () => {
    // Read attempt
    const readRes = await outsiderAgent.get(`/api/documents/${testDocId}`);
    expect(readRes.status).toBe(404);

    // Download attempt
    const downloadRes = await outsiderAgent.get(`/api/documents/${testDocId}/download`);
    expect(downloadRes.status).toBe(404);

    // Update attempt
    const updateRes = await patchWithCsrf(
      outsiderAgent,
      `/api/documents/${testDocId}`,
      { name: "Hacked Name" }
    );
    expect(updateRes.status).toBe(404);

    // Delete attempt
    const deleteRes = await deleteWithCsrf(
      outsiderAgent,
      `/api/documents/${testDocId}`
    );
    expect(deleteRes.status).toBe(404);

    // Grant permission attempt
    const grantRes = await postWithCsrf(
      outsiderAgent,
      `/api/documents/${testDocId}/permissions`,
      { email: outsiderUser.email, permission: "read" }
    );
    expect(grantRes.status).toBe(404);
  });

  // --------------------------------------------------
  // 6. Filename Sanitization & Path Traversal Prevention
  // --------------------------------------------------

  test("Filename path traversal sequences are sanitized safely", async () => {
    const contents = Buffer.from("Safe content test", "utf8");
    const traversalFilename = "../../../../../etc/passwd";

    const response = await uploadFile(
      ownerAgent,
      traversalFilename,
      contents,
      "traversal-test"
    );

    expect(response.status).toBe(201);
    expect(response.body.document.name).toBe("passwd");
    createdDocIds.add(String(response.body.document.id));

    const keyRes = await pool.query(
      "SELECT storage_key FROM documents WHERE id = $1",
      [response.body.document.id]
    );
    if (keyRes.rows[0]?.storage_key) {
      createdStorageKeys.add(keyRes.rows[0].storage_key);
    }
  });

  test("Upload rejects filename consisting solely of dot or traversal characters", async () => {
    const contents = Buffer.from("Empty dot filename content", "utf8");
    const response = await uploadFile(ownerAgent, "..", contents);

    expect(response.status).toBe(400);
    expect(["Invalid filename or empty file", "A file is required"]).toContain(
      response.body.error
    );
  });

  // --------------------------------------------------
  // 7. Request Payload Validation & Malformed JSON
  // --------------------------------------------------

  test("Malformed JSON payload returns 400 Bad Request", async () => {
    const token = await getCsrfToken(ownerAgent);

    const response = await ownerAgent
      .patch(`/api/documents/${testDocId}`)
      .set("X-CSRF-Token", token)
      .set("Content-Type", "application/json")
      .send("{ invalid json: broken ");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Malformed JSON payload"
    });
  });

  // --------------------------------------------------
  // 8. Search, Date Validation & Filtering
  // --------------------------------------------------

  test("Document search filters correctly by name and category", async () => {
    const response = await ownerAgent.get(
      "/api/documents?category=updated-category"
    );

    expect(response.status).toBe(200);
    expect(response.body.documents).toBeInstanceOf(Array);
    expect(
      response.body.documents.some((d) => String(d.id) === String(testDocId))
    ).toBe(true);
  });

  test("Document search rejects invalid calendar date", async () => {
    const response = await ownerAgent.get(
      "/api/documents?from=2026-02-31"
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Invalid from date"
    });
  });

  test("Document search rejects reversed date range where from is after to", async () => {
    const response = await ownerAgent.get(
      "/api/documents?from=2026-12-31&to=2026-01-01"
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Invalid date range: 'from' must be before or equal to 'to'"
    });
  });

  // --------------------------------------------------
  // 9. Document Deletion & Storage Cleanup
  // --------------------------------------------------

  test("Owner document deletion cascades permissions and purges physical file", async () => {
    // Upload a document specifically for deletion
    const delContent = Buffer.from("To be deleted content", "utf8");
    const upRes = await uploadFile(
      ownerAgent,
      `doc-to-delete-${unique}.txt`,
      delContent
    );
    expect(upRes.status).toBe(201);
    const deleteId = upRes.body.document.id;
    createdDocIds.add(deleteId);

    // Grant permission to viewer
    await postWithCsrf(
      ownerAgent,
      `/api/documents/${deleteId}/permissions`,
      { email: viewerUser.email, permission: "read" }
    );

    // Retrieve storage key and verify physical file exists
    const keyRes = await pool.query(
      "SELECT storage_key FROM documents WHERE id = $1",
      [deleteId]
    );
    const key = keyRes.rows[0].storage_key;
    const filePath = storagePath(key);

    const existsBefore = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(existsBefore).toBe(true);

    // Delete document
    const delRes = await deleteWithCsrf(ownerAgent, `/api/documents/${deleteId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toEqual({
      message: "Document deleted successfully"
    });

    // Verify DB record is gone
    const dbCheck = await pool.query(
      "SELECT id FROM documents WHERE id = $1",
      [deleteId]
    );
    expect(dbCheck.rows).toHaveLength(0);

    // Verify cascaded permissions are gone
    const permCheck = await pool.query(
      "SELECT id FROM document_permissions WHERE document_id = $1",
      [deleteId]
    );
    expect(permCheck.rows).toHaveLength(0);

    // Verify physical file was purged from disk
    const existsAfter = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);

    // Verify deletion audit event
    const delAudit = await pool.query(
      `SELECT outcome
       FROM audit_logs
       WHERE actor_id = $1 AND action = 'document_delete' AND document_id = $2
       ORDER BY id DESC LIMIT 1`,
      [ownerUser.id, deleteId]
    );
    expect(delAudit.rows[0]?.outcome).toBe("success");
  });

  // --------------------------------------------------
  // 10. Audit Log Integrity & Secret Omission
  // --------------------------------------------------

  test("Audit logs do not store secrets, passwords, CSRF tokens, or encryption keys", async () => {
    const logs = await pool.query(
      `SELECT details::text AS details_text
       FROM audit_logs
       WHERE actor_id = ANY($1::bigint[])`,
      [[adminUser.id, ownerUser.id, viewerUser.id, editorUser.id, outsiderUser.id]]
    );

    for (const row of logs.rows) {
      expect(row.details_text).not.toContain(testPassword);
      expect(row.details_text).not.toContain("password_hash");
      expect(row.details_text).not.toContain("FILE_ENCRYPTION_KEY");
      expect(row.details_text).not.toContain("SESSION_SECRET");
      expect(row.details_text).not.toContain("CSRF_SECRET");
    }
  });
});
