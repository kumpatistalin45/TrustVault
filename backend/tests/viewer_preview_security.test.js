const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");
const { readEncryptedFile } = require("../storageService");

describe("Viewer Security & In-App Preview Access Control Suite", () => {
  let ownerUser;
  let viewerUser;
  let adminUser;

  let ownerAgent;
  let viewerAgent;
  let adminAgent;

  let testDocumentId;
  let timedDocumentId;
  let secretDocumentId;

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testPassword = "ViewerSec2026!Secure";
  const accessSecretKey = "VaultPasscode9988!";

  const createdUserIds = new Set();
  const createdDocIds = new Set();

  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    return res.body.csrfToken;
  }

  async function login(agent, email) {
    const csrf = await getCsrfToken(agent);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrf)
      .send({ email, password: testPassword });
    expect(res.status).toBe(200);
  }

  async function postWithCsrf(agent, url, body) {
    const token = await getCsrfToken(agent);
    return agent
      .post(url)
      .set("X-CSRF-Token", token)
      .send(body);
  }

  async function deleteWithCsrf(agent, url) {
    const token = await getCsrfToken(agent);
    return agent
      .delete(url)
      .set("X-CSRF-Token", token);
  }

  async function uploadDoc(agent, filename, contentBuffer, options = {}) {
    const csrf = await getCsrfToken(agent);
    let req = agent
      .post("/api/documents")
      .set("X-CSRF-Token", csrf)
      .attach("file", contentBuffer, filename);

    if (options.secretKey) {
      req = req.field("secretKey", options.secretKey);
    }
    if (options.timerEnabled) {
      req = req.field("timerEnabled", "true");
    }
    if (options.timerMinutes) {
      req = req.field("timerMinutes", String(options.timerMinutes));
    }
    if (options.category) {
      req = req.field("category", options.category);
    }

    const res = await req;
    expect(res.status).toBe(201);
    createdDocIds.add(res.body.document.id);
    return res.body.document;
  }

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testPassword, 10);

    // 1. Create Owner User
    const ownerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')
       RETURNING id, name, email, role`,
      [`Owner ${unique}`, `owner_${unique}@trustvault.internal`, passwordHash]
    );
    ownerUser = ownerRes.rows[0];
    createdUserIds.add(ownerUser.id);

    // 2. Create Viewer User
    const viewerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'viewer', 'active')
       RETURNING id, name, email, role`,
      [`Viewer ${unique}`, `viewer_${unique}@trustvault.internal`, passwordHash]
    );
    viewerUser = viewerRes.rows[0];
    createdUserIds.add(viewerUser.id);

    // 3. Create Admin User
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       RETURNING id, name, email, role`,
      [`Admin ${unique}`, `admin_${unique}@trustvault.internal`, passwordHash]
    );
    adminUser = adminRes.rows[0];
    createdUserIds.add(adminUser.id);

    // Agents
    ownerAgent = request.agent(app);
    viewerAgent = request.agent(app);
    adminAgent = request.agent(app);

    await login(ownerAgent, ownerUser.email);
    await login(viewerAgent, viewerUser.email);
    await login(adminAgent, adminUser.email);

    // 4. Owner uploads a standard PDF document
    const standardDoc = await uploadDoc(
      ownerAgent,
      "security_policy.pdf",
      Buffer.from("%PDF-1.4 Confidential Policy Data", "utf8")
    );
    testDocumentId = standardDoc.id;

    // Share standard doc with viewer
    await postWithCsrf(ownerAgent, `/api/documents/${testDocumentId}/permissions`, {
      email: viewerUser.email,
      permission: "read"
    });

    // 5. Owner uploads a secret-key protected timed document
    const secretDoc = await uploadDoc(
      ownerAgent,
      "confidential_intel.pdf",
      Buffer.from("%PDF-1.4 Secret Strategy Report", "utf8"),
      {
        secretKey: accessSecretKey,
        timerEnabled: true,
        timerMinutes: 5
      }
    );
    secretDocumentId = secretDoc.id;

    // Share secret doc with viewer
    await postWithCsrf(ownerAgent, `/api/documents/${secretDocumentId}/permissions`, {
      email: viewerUser.email,
      permission: "read"
    });
  });

  afterAll(async () => {
    for (const docId of createdDocIds) {
      try {
        const docRes = await pool.query("SELECT storage_key FROM documents WHERE id = $1", [docId]);
        await pool.query("DELETE FROM document_permissions WHERE document_id = $1", [docId]);
        await pool.query("DELETE FROM audit_logs WHERE document_id = $1", [docId]);
        await pool.query("DELETE FROM documents WHERE id = $1", [docId]);
        if (docRes.rows[0]?.storage_key) {
          const fs = require("fs/promises");
          const path = require("path");
          await fs.unlink(path.join(__dirname, "..", "storage", docRes.rows[0].storage_key)).catch(() => {});
        }
      } catch (_e) {}
    }

    for (const userId of createdUserIds) {
      try {
        await pool.query("DELETE FROM audit_logs WHERE actor_id = $1 OR target_user_id = $1", [userId]);
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      } catch (_e) {}
    }
  });

  // --------------------------------------------------------------------------
  // 1. Viewer Preview & Download Restrictions
  // --------------------------------------------------------------------------
  describe("Viewer Preview vs Download Authorization", () => {
    test("Viewer can preview authorized standard document (GET /preview -> 200)", async () => {
      const res = await viewerAgent.get(`/api/documents/${testDocumentId}/preview`);
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe("inline");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["cache-control"]).toContain("no-store");
      expect((res.text || res.body.toString("utf8"))).toContain("%PDF-1.4 Confidential Policy Data");
    });

    test("Viewer download request returns HTTP 404 (GET /download -> 404)", async () => {
      const res = await viewerAgent.get(`/api/documents/${testDocumentId}/download`);
      expect(res.status).toBe(404);
    });

    test("Viewer cannot bypass download restriction via query params, headers, or spoofed role", async () => {
      // 1. Attempt with spoofed role header or body
      const spoofRes = await viewerAgent
        .get(`/api/documents/${testDocumentId}/download?role=owner`)
        .set("X-User-Role", "owner")
        .set("X-Role", "admin");
      expect(spoofRes.status).toBe(404);

      // 2. Attempt with download=true parameter on preview
      const previewWithParam = await viewerAgent
        .get(`/api/documents/${testDocumentId}/preview?download=true`);
      expect(previewWithParam.status).toBe(200);
      expect(previewWithParam.headers["content-disposition"]).toBe("inline");
    });

    test("Viewer cannot access arbitrary document by manipulating document IDs", async () => {
      const unsharedRes = await viewerAgent.get("/api/documents/99999999/preview");
      expect(unsharedRes.status).toBe(404);

      const unsharedDl = await viewerAgent.get("/api/documents/99999999/download");
      expect(unsharedDl.status).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Secret Key Validation & Access Timer Enforcement
  // --------------------------------------------------------------------------
  describe("Secret Key Gate & Access Timer Enforcement", () => {
    test("Viewer cannot preview secret-key protected document without unlocking first (403)", async () => {
      const res = await viewerAgent.get(`/api/documents/${secretDocumentId}/preview`);
      expect(res.status).toBe(403);
      expect(res.body.locked).toBe(true);
      expect(res.body.error).toContain("secret key");
    });

    test("Viewer cannot unlock with invalid key (HTTP 400)", async () => {
      const res = await postWithCsrf(viewerAgent, `/api/documents/${secretDocumentId}/unlock`, {
        secretKey: "CompletelyWrongKey!"
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid secret key");
    });

    test("Viewer unlocks with valid key, can preview in-app, but download returns 404", async () => {
      const unlockRes = await postWithCsrf(viewerAgent, `/api/documents/${secretDocumentId}/unlock`, {
        secretKey: accessSecretKey
      });
      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.unlocked).toBe(true);
      expect(unlockRes.body.timer_duration_minutes).toBe(5);

      // Now preview succeeds with HTTP 200
      const previewRes = await viewerAgent.get(`/api/documents/${secretDocumentId}/preview`);
      expect(previewRes.status).toBe(200);
      expect(previewRes.headers["content-disposition"]).toBe("inline");
      expect((previewRes.text || previewRes.body.toString("utf8"))).toContain("%PDF-1.4 Secret Strategy Report");

      // Download returns 404 (endpoint removed)
      const downloadRes = await viewerAgent.get(`/api/documents/${secretDocumentId}/download`);
      expect(downloadRes.status).toBe(404);
    });

    test("Expired access timer immediately blocks subsequent preview requests (403)", async () => {
      // Simulate expired unlocked_at (set unlocked_at to 10 minutes ago, while duration is 5)
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      await pool.query(
        "UPDATE documents SET unlocked_at = $1 WHERE id = $2",
        [tenMinsAgo, secretDocumentId]
      );

      const previewRes = await viewerAgent.get(`/api/documents/${secretDocumentId}/preview`);
      expect(previewRes.status).toBe(403);
      expect(previewRes.body.expired).toBe(true);
      expect(previewRes.body.error).toContain("expired");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Permission Revocation Enforcement
  // --------------------------------------------------------------------------
  describe("Permission Revocation Enforcement", () => {
    test("Revoking viewer permission immediately blocks subsequent preview requests (404)", async () => {
      // 1. Verify viewer currently can preview testDocumentId
      const beforeRevoke = await viewerAgent.get(`/api/documents/${testDocumentId}/preview`);
      expect(beforeRevoke.status).toBe(200);

      // 2. Owner revokes viewer permission
      const revokeRes = await deleteWithCsrf(
        ownerAgent,
        `/api/documents/${testDocumentId}/permissions/${viewerUser.id}`
      );
      expect(revokeRes.status).toBe(200);

      // 3. Preview immediately returns 404 (access denied / not found)
      const afterRevoke = await viewerAgent.get(`/api/documents/${testDocumentId}/preview`);
      expect(afterRevoke.status).toBe(404);

      // 4. Download returns 404
      const dlAfterRevoke = await viewerAgent.get(`/api/documents/${testDocumentId}/download`);
      expect(dlAfterRevoke.status).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Owner and Admin Workflows Intact
  // --------------------------------------------------------------------------
  describe("Owner & Admin Workflows Intact", () => {
    test("Removed download route returns 404 for Owner", async () => {
      const res = await ownerAgent.get(`/api/documents/${secretDocumentId}/download`);
      expect(res.status).toBe(404);
    });

    test("Owner can preview their own documents (200 with inline disposition)", async () => {
      const res = await ownerAgent.get(`/api/documents/${secretDocumentId}/preview`);
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe("inline");
      expect((res.text || res.body.toString("utf8"))).toContain("%PDF-1.4 Secret Strategy Report");
    });

    test("Underlying AES-256-GCM file encryption envelope remains intact on disk", async () => {
      const docRes = await pool.query(
        "SELECT storage_key FROM documents WHERE id = $1",
        [secretDocumentId]
      );
      const envelope = await readEncryptedFile(docRes.rows[0].storage_key);

      expect(envelope).toBeDefined();
      expect(Buffer.isBuffer(envelope)).toBe(true);
      expect(["TVE1", "TVE2"]).toContain(envelope.subarray(0, 4).toString("ascii"));
      expect(envelope.length).toBeGreaterThan(32);
    });
  });
});
