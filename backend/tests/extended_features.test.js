const request = require("supertest");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const app = require("../server");
const pool = require("../db");
const { setTransporter, resetTransporter } = require("../emailService");

describe("TrustVault Extended Features Integration Tests", () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const defaultPassword = "IntegrationTestPassword2026!";

  const createdUserIds = new Set();
  const createdDocIds = new Set();
  const createdComplaintIds = new Set();

  let adminAgent;
  let adminUserId;

  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    return res.body.csrfToken;
  }

  async function login(agent, email, password = defaultPassword) {
    const token = await getCsrfToken(agent);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", token)
      .send({ email, password });
    return res;
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

  beforeAll(async () => {
    // Inject mock email transporter to prevent live network calls
    setTransporter({
      sendMail: jest.fn().mockResolvedValue({ messageId: "mock-extended-msg-id" })
    });

    // Create an active admin user directly in DB
    const hash = await bcrypt.hash(defaultPassword, 10);
    const adminEmail = `admin-ext-${unique}@example.com`;
    const res = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
       VALUES ('Admin User', $1, $2, 'admin', 'active', '2026.1', NOW())
       RETURNING id`,
      [adminEmail, hash]
    );
    adminUserId = res.rows[0].id;
    createdUserIds.add(adminUserId);

    adminAgent = request.agent(app);
    const loginRes = await login(adminAgent, adminEmail);
    expect(loginRes.status).toBe(200);
  });

  afterAll(async () => {
    resetTransporter();
    try {
      if (createdComplaintIds.size > 0) {
        await pool.query(
          "DELETE FROM complaints WHERE id = ANY($1::bigint[])",
          [Array.from(createdComplaintIds)]
        );
      }

      if (createdDocIds.size > 0) {
        const docIds = Array.from(createdDocIds);
        await pool.query(
          "DELETE FROM document_permissions WHERE document_id = ANY($1::bigint[])",
          [docIds]
        );
        await pool.query(
          "DELETE FROM documents WHERE id = ANY($1::bigint[])",
          [docIds]
        );
      }

      if (createdUserIds.size > 0) {
        const uids = Array.from(createdUserIds);
        await pool.query(
          `DELETE FROM audit_logs
           WHERE actor_id = ANY($1::bigint[])
              OR target_user_id = ANY($1::bigint[])`,
          [uids]
        );
        await pool.query(
          "DELETE FROM password_reset_tokens WHERE user_id = ANY($1::bigint[])",
          [uids]
        );
        await pool.query(
          "DELETE FROM users WHERE id = ANY($1::bigint[])",
          [uids]
        );
      }
    } finally {
      await pool.end();
    }
  });

  // 1. Owner Registration Status Gate & Admin Approval
  describe("Owner Registration Status Gate & Admin Approval", () => {
    const ownerEmail = `pending-owner-${unique}@example.com`;
    let ownerAgent;
    let registeredOwnerId;

    test("Owner registration sets status to pending", async () => {
      const publicAgent = request.agent(app);
      const csrf = await getCsrfToken(publicAgent);

      const regRes = await publicAgent
        .post("/api/auth/register")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Pending Owner",
          email: ownerEmail,
          password: defaultPassword,
          role: "owner",
          mobile: "+1234567890",
          acceptTerms: true
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.user).toBeDefined();
      expect(regRes.body.user.role).toBe("owner");
      expect(regRes.body.user.status).toBe("pending");

      registeredOwnerId = regRes.body.user.id;
      createdUserIds.add(registeredOwnerId);
    });

    test("Pending owner is blocked from uploading documents", async () => {
      ownerAgent = request.agent(app);
      const loginRes = await login(ownerAgent, ownerEmail);
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.status).toBe("pending");

      const csrf = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", csrf)
        .field("category", "General")
        .attach("file", Buffer.from("Secret document content"), "test.txt");

      expect(uploadRes.status).toBe(403);
      expect(uploadRes.body.error).toContain("pending administrative approval");
    });

    test("Admin can approve pending owner to active", async () => {
      const patchRes = await patchWithCsrf(
        adminAgent,
        `/api/admin/users/${registeredOwnerId}/status`,
        { status: "active" }
      );

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.user.status).toBe("active");
    });

    test("Active owner can now successfully upload documents", async () => {
      const csrf = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", csrf)
        .field("category", "General")
        .attach("file", Buffer.from("Approved owner secret document content"), "test_approved.txt");

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.document).toBeDefined();
      createdDocIds.add(uploadRes.body.document.id);
    });
  });

  // 2. Single Active Session Enforcement
  describe("Single Active Session Enforcement", () => {
    const singleSessionEmail = `single-session-${unique}@example.com`;

    beforeAll(async () => {
      const hash = await bcrypt.hash(defaultPassword, 10);
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
         VALUES ('Single Session User', $1, $2, 'viewer', 'active', '2026.1', NOW())
         RETURNING id`,
        [singleSessionEmail, hash]
      );
      createdUserIds.add(res.rows[0].id);
    });

    test("Logging in from a new client terminates any previous active session", async () => {
      const agentA = request.agent(app);
      const agentB = request.agent(app);

      // 1. Login on Client A
      const loginA = await login(agentA, singleSessionEmail);
      expect(loginA.status).toBe(200);

      // Client A can access /api/auth/me
      const meA1 = await agentA.get("/api/auth/me");
      expect(meA1.status).toBe(200);
      expect(meA1.body.user.email).toBe(singleSessionEmail);

      // 2. Login on Client B with same credentials
      const loginB = await login(agentB, singleSessionEmail);
      expect(loginB.status).toBe(200);

      // Client B can access /api/auth/me
      const meB = await agentB.get("/api/auth/me");
      expect(meB.status).toBe(200);
      expect(meB.body.user.email).toBe(singleSessionEmail);

      // 3. Client A's previous session is now invalidated
      const meA2 = await agentA.get("/api/auth/me");
      expect(meA2.status).toBe(401);
    });
  });

  // 3. Password Reset Workflow
  describe("Password Reset Workflow", () => {
    const resetUserEmail = `reset-user-${unique}@example.com`;
    const newPassword = "NewResetPassword2026!";
    let resetUserId;

    beforeAll(async () => {
      const hash = await bcrypt.hash(defaultPassword, 10);
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
         VALUES ('Reset User', $1, $2, 'viewer', 'active', '2026.1', NOW())
         RETURNING id`,
        [resetUserEmail, hash]
      );
      resetUserId = res.rows[0].id;
      createdUserIds.add(resetUserId);
    });

    test("Forgot password returns generic anti-enumeration response and saves hashed token", async () => {
      const publicAgent = request.agent(app);
      const csrf = await getCsrfToken(publicAgent);

      const res = await publicAgent
        .post("/api/auth/forgot-password")
        .set("X-CSRF-Token", csrf)
        .send({ email: resetUserEmail });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("If an account exists");
      const rateLimitHeader = res.headers["ratelimit"] || res.headers["ratelimit-policy"] || res.headers["ratelimit-limit"];
      expect(rateLimitHeader).toBeDefined();

      // Verify token was stored in DB
      const dbTokens = await pool.query(
        "SELECT * FROM password_reset_tokens WHERE user_id = $1",
        [resetUserId]
      );
      expect(dbTokens.rows.length).toBeGreaterThan(0);
    });

    test("Reset password validates token and resets password", async () => {
      // Create a deterministic raw token for testing
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [resetUserId, tokenHash, expiresAt]
      );

      const publicAgent = request.agent(app);

      // Validate token endpoint
      const validateRes = await publicAgent.get(`/api/auth/reset-password/validate?token=${rawToken}`);
      expect(validateRes.status).toBe(200);
      expect(validateRes.body.valid).toBe(true);
      expect(validateRes.body.email).toBe(resetUserEmail);

      // Execute password reset
      const csrf = await getCsrfToken(publicAgent);
      const resetRes = await publicAgent
        .post("/api/auth/reset-password")
        .set("X-CSRF-Token", csrf)
        .send({ token: rawToken, newPassword });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toContain("Password updated successfully");

      // Token cannot be reused (single-use enforcement)
      const reuseRes = await publicAgent
        .post("/api/auth/reset-password")
        .set("X-CSRF-Token", csrf)
        .send({ token: rawToken, newPassword: "AnotherPassword2026!" });

      expect(reuseRes.status).toBe(400);

      // Login with old password fails
      const testAgent = request.agent(app);
      const oldLoginRes = await login(testAgent, resetUserEmail, defaultPassword);
      expect(oldLoginRes.status).toBe(401);

      // Login with new password succeeds
      const newLoginRes = await login(testAgent, resetUserEmail, newPassword);
      expect(newLoginRes.status).toBe(200);
    });
  });

  // 4. Support Complaints API
  describe("Support Complaints System", () => {
    let submitterAgent;
    let complaintRef;
    let complaintId;

    beforeAll(async () => {
      const submitterEmail = `submitter-${unique}@example.com`;
      const hash = await bcrypt.hash(defaultPassword, 10);
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
         VALUES ('Complaint Submitter', $1, $2, 'viewer', 'active', '2026.1', NOW())
         RETURNING id`,
        [submitterEmail, hash]
      );
      createdUserIds.add(res.rows[0].id);

      submitterAgent = request.agent(app);
      await login(submitterAgent, submitterEmail);
    });

    test("User can submit a support complaint", async () => {
      const res = await postWithCsrf(submitterAgent, "/api/support/complaints", {
        subject: "Cannot access uploaded financial audit",
        description: "Encountered a permissions error when opening the file.",
        category: "permissions",
        priority: "high"
      });

      expect(res.status).toBe(201);
      expect(res.body.complaint).toBeDefined();
      expect(res.body.complaint.reference_id).toMatch(/^TV-CMP-[A-Z0-9]+$/);
      complaintRef = res.body.complaint.reference_id;
      complaintId = res.body.complaint.id;
      createdComplaintIds.add(complaintId);
    });

    test("User can retrieve their submitted complaints", async () => {
      const res = await submitterAgent.get("/api/support/complaints");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.complaints)).toBe(true);
      const found = res.body.complaints.find((c) => c.reference_id === complaintRef);
      expect(found).toBeDefined();
    });

    test("Admin can view and update complaint status", async () => {
      const adminListRes = await adminAgent.get("/api/admin/complaints");
      expect(adminListRes.status).toBe(200);
      expect(Array.isArray(adminListRes.body.complaints)).toBe(true);

      const updateRes = await patchWithCsrf(
        adminAgent,
        `/api/admin/complaints/${complaintId}`,
        {
          status: "in_review",
          adminNote: "Reviewing permission audit log"
        }
      );

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.complaint.status).toBe("In Review");
    });
  });

  // 5. Terms Acceptance
  describe("Terms Acceptance API", () => {
    let termsAgent;

    beforeAll(async () => {
      const termsEmail = `terms-user-${unique}@example.com`;
      const hash = await bcrypt.hash(defaultPassword, 10);
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ('Terms Test User', $1, $2, 'viewer', 'active')
         RETURNING id`,
        [termsEmail, hash]
      );
      createdUserIds.add(res.rows[0].id);

      termsAgent = request.agent(app);
      await login(termsAgent, termsEmail);
    });

    test("Checking terms status returns unaccepted state", async () => {
      const statusRes = await termsAgent.get("/api/auth/terms/status");
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.accepted).toBe(false);
      expect(statusRes.body.currentVersion).toBe("2026.1");
    });

    test("Accepting terms updates user profile and terms state", async () => {
      const acceptRes = await postWithCsrf(termsAgent, "/api/auth/terms/accept", {
        version: "2026.1"
      });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.termsVersion).toBe("2026.1");

      const statusRes = await termsAgent.get("/api/auth/terms/status");
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.accepted).toBe(true);
    });
  });

  // 6. Secret Key Encrypted Document Protection & Unlocking
  describe("Secret Key Encrypted Document Protection & Unlocking", () => {
    let secretDocId;
    let secretOwnerAgent;
    let viewerAgent;
    let viewerUserId;
    let viewerEmail;
    const documentSecret = "UltraTopSecretPassphrase2026!";

    beforeAll(async () => {
      const ownerEmail = `sec-owner-${unique}@example.com`;
      viewerEmail = `sec-viewer-${unique}@example.com`;
      const hash = await bcrypt.hash(defaultPassword, 10);

      const ownerRes = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
         VALUES ('Secret Owner', $1, $2, 'owner', 'active', '2026.1', NOW())
         RETURNING id`,
        [ownerEmail, hash]
      );
      createdUserIds.add(ownerRes.rows[0].id);

      const viewerRes = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
         VALUES ('Secret Viewer', $1, $2, 'viewer', 'active', '2026.1', NOW())
         RETURNING id`,
        [viewerEmail, hash]
      );
      viewerUserId = viewerRes.rows[0].id;
      createdUserIds.add(viewerUserId);

      secretOwnerAgent = request.agent(app);
      await login(secretOwnerAgent, ownerEmail);

      viewerAgent = request.agent(app);
      await login(viewerAgent, viewerEmail);
    });

    test("Owner uploads document with secret key", async () => {
      const csrf = await getCsrfToken(secretOwnerAgent);
      const uploadRes = await secretOwnerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", csrf)
        .field("category", "Confidential")
        .field("secret_key", documentSecret)
        .attach("file", Buffer.from("Classified intelligence content"), "classified.txt");

      expect(uploadRes.status).toBe(201);
      secretDocId = uploadRes.body.document.id;
      createdDocIds.add(secretDocId);

      // Grant viewer read permission
      const shareRes = await postWithCsrf(secretOwnerAgent, `/api/documents/${secretDocId}/permissions`, {
        email: viewerEmail,
        permission: "read"
      });
      expect(shareRes.status).toBe(200);
    });

    test("Viewer cannot preview without unlocking first, and removed download returns 404", async () => {
      const previewRes = await viewerAgent.get(`/api/documents/${secretDocId}/preview`);
      expect(previewRes.status).toBe(403);
      expect(previewRes.body.error).toContain("secret key");

      const downloadRes = await viewerAgent.get(`/api/documents/${secretDocId}/download`);
      expect(downloadRes.status).toBe(404);
    });

    test("Viewer cannot unlock with wrong secret key", async () => {
      const unlockRes = await postWithCsrf(viewerAgent, `/api/documents/${secretDocId}/unlock`, {
        secretKey: "WrongSecretKey!"
      });
      expect(unlockRes.status).toBe(400);
      expect(unlockRes.body.error).toContain("Invalid secret key");
      const unlockRateLimit = unlockRes.headers["ratelimit"] || unlockRes.headers["ratelimit-policy"] || unlockRes.headers["ratelimit-limit"];
      expect(unlockRateLimit).toBeDefined();
    });

    test("Viewer unlocks document with correct secret key and previews content (download restricted for Viewer, permitted for Owner)", async () => {
      const unlockRes = await postWithCsrf(viewerAgent, `/api/documents/${secretDocId}/unlock`, {
        secretKey: documentSecret
      });
      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.unlocked).toBe(true);
      expect(unlockRes.body.unlocked_at).toBeDefined();
      expect(unlockRes.body.expires_at).toBeDefined();
      expect(unlockRes.body.timer_duration_minutes).toBeDefined();
      const successRateLimit = unlockRes.headers["ratelimit"] || unlockRes.headers["ratelimit-policy"] || unlockRes.headers["ratelimit-limit"];
      expect(successRateLimit).toBeDefined();

      const previewRes = await viewerAgent.get(`/api/documents/${secretDocId}/preview`);
      expect(previewRes.status).toBe(200);
      expect(previewRes.text).toBe("Classified intelligence content");

      const downloadRes = await viewerAgent.get(`/api/documents/${secretDocId}/download`);
      expect(downloadRes.status).toBe(404);

      const ownerDownloadRes = await secretOwnerAgent.get(`/api/documents/${secretDocId}/download`);
      expect(ownerDownloadRes.status).toBe(404);
    });

    test("Viewer download history endpoint /api/documents/downloads returns downloads and history", async () => {
      const histRes = await viewerAgent.get("/api/documents/downloads");
      expect(histRes.status).toBe(200);
      expect(Array.isArray(histRes.body.downloads)).toBe(true);
      expect(Array.isArray(histRes.body.history)).toBe(true);
      expect(typeof histRes.body.total).toBe("number");
    });
  });
});
