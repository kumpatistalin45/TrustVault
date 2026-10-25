process.env.RATE_LIMIT_LOGIN = "200";
const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");
const { _setFirebaseAdminForTesting, _resetFirebaseAdminForTesting } = require("../firebaseService");

describe("TrustVault Complete Role-Based Authentication & End-to-End Integration", () => {
  const unique = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const testPassword = "AdminSecurePassword2026!";

  let adminUser;
  let ownerUser;
  let viewerUser;
  let suspendedUser;

  const createdUserIds = new Set();
  const createdDocIds = new Set();

  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    return res.body.csrfToken;
  }

  beforeAll(async () => {
    const hash = await bcrypt.hash(testPassword, 12);

    // 1. Provision Admin Account
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       RETURNING id, name, email, role, status`,
      [`Admin User ${unique}`, `admin_${unique}@trustvault.internal`, hash]
    );
    adminUser = adminRes.rows[0];
    createdUserIds.add(adminUser.id);

    // 2. Provision Owner Account
    const ownerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')
       RETURNING id, name, email, role, status`,
      [`Owner User ${unique}`, `owner_${unique}@trustvault.internal`, hash]
    );
    ownerUser = ownerRes.rows[0];
    createdUserIds.add(ownerUser.id);

    // 3. Provision Viewer Account
    const viewerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, owner_id)
       VALUES ($1, $2, $3, 'viewer', 'active', $4)
       RETURNING id, name, email, role, status`,
      [`Viewer User ${unique}`, `viewer_${unique}@trustvault.internal`, hash, ownerUser.id]
    );
    viewerUser = viewerRes.rows[0];
    createdUserIds.add(viewerUser.id);

    // 4. Provision Suspended User Account
    const suspendedRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'owner', 'suspended')
       RETURNING id, name, email, role, status`,
      [`Suspended User ${unique}`, `suspended_${unique}@trustvault.internal`, hash]
    );
    suspendedUser = suspendedRes.rows[0];
    createdUserIds.add(suspendedUser.id);
  });

  afterAll(async () => {
    _resetFirebaseAdminForTesting();

    if (createdDocIds.size > 0) {
      const docIds = Array.from(createdDocIds);
      await pool.query("DELETE FROM document_permissions WHERE document_id = ANY($1::bigint[])", [docIds]);
      await pool.query("DELETE FROM documents WHERE id = ANY($1::bigint[])", [docIds]);
    }

    if (createdUserIds.size > 0) {
      const userIds = Array.from(createdUserIds);
      await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = ANY($1::text[])", [userIds.map(String)]);
      await pool.query("DELETE FROM audit_logs WHERE actor_id = ANY($1::bigint[]) OR target_user_id = ANY($1::bigint[])", [userIds]);
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
    }
  });

  // =========================================================================
  // 1. ADMIN AUTHENTICATION — USERNAME AND PASSWORD
  // =========================================================================
  describe("1. Admin Authentication (Username & Password)", () => {
    it("authenticates Admin with valid username/name and password, establishing valid session", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({
          username: adminUser.name,
          password: testPassword,
          role: "admin"
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe("admin");
      expect(res.body.user.email).toBe(adminUser.email);
    });

    it("authenticates Admin with valid corporate email and password", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({
          email: adminUser.email,
          password: testPassword,
          role: "admin"
        });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("admin");
    });

    it("rejects Admin login with invalid password (401)", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({
          username: adminUser.name,
          password: "WrongPassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid (username|email) or password/i);
    });

    it("rejects non-admin accounts attempting to log in via admin portal with role='admin'", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({
          username: viewerUser.name,
          password: testPassword,
          role: "admin"
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/administrator access required/i);
    });

    it("STRICTLY REJECTS Admin accounts from Forgot Password workflow (403)", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/forgot-password")
        .set("X-CSRF-Token", csrf)
        .send({ email: adminUser.email });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/password reset is not permitted for administrator accounts/i);
    });

    it("blocks Admin-only endpoints from Owner and Viewer roles (403)", async () => {
      const viewerAgent = request.agent(app);
      const viewerCsrf = await getCsrfToken(viewerAgent);

      await viewerAgent
        .post("/api/auth/login")
        .set("X-CSRF-Token", viewerCsrf)
        .send({ email: viewerUser.email, password: testPassword });

      const adminAuditRes = await viewerAgent.get("/api/admin/audit-logs");
      expect(adminAuditRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. OWNER AUTHENTICATION — FIREBASE EMAIL OTP
  // =========================================================================
  describe("2. Owner Authentication (Firebase Verification)", () => {
    beforeEach(() => {
      _setFirebaseAdminForTesting(async (idToken) => {
        if (idToken === "valid-owner-token") {
          return { email: ownerUser.email, uid: "fb-owner-uid-123" };
        }
        if (idToken === "unprovisioned-token") {
          return { email: "unprovisioned.person@company.com", uid: "fb-unknown-uid" };
        }
        if (idToken === "suspended-owner-token") {
          return { email: suspendedUser.email, uid: "fb-suspended-uid" };
        }
        if (idToken === "admin-otp-token") {
          return { email: adminUser.email, uid: "fb-admin-uid" };
        }
        throw new Error("Firebase ID token verification failed: expired token");
      });
    });

    it("authenticates provisioned Owner via Firebase ID token and establishes session", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "valid-owner-token", role: "owner" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(ownerUser.email);
      expect(res.body.user.role).toBe("owner");

      // Verify session works for protected Owner API
      const docsRes = await agent.get("/api/documents");
      expect(docsRes.status).toBe(200);
    });

    it("rejects unprovisioned email with 403 Forbidden", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "unprovisioned-token" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/not provisioned in trustvault/i);
    });

    it("rejects suspended Owner account with 403 Forbidden", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "suspended-owner-token" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/suspended/i);
    });

    it("rejects Admin account attempting Firebase OTP login per Requirement 2.3 (403)", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "admin-otp-token" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/administrator accounts must authenticate using username and password/i);
    });

    it("rejects invalid/expired Firebase token with 401 Unauthorized", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "completely-bogus-token" });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/firebase/i);
    });
  });

  // =========================================================================
  // 3. VIEWER AUTHENTICATION — FIREBASE EMAIL OTP & RESTRICTIONS
  // =========================================================================
  describe("3. Viewer Authentication (Firebase Verification)", () => {
    beforeEach(() => {
      _setFirebaseAdminForTesting(async (idToken) => {
        if (idToken === "valid-viewer-token") {
          return { email: viewerUser.email, uid: "fb-viewer-uid-456" };
        }
        throw new Error("Firebase ID token verification failed: expired token");
      });
    });

    it("authenticates provisioned Viewer via Firebase ID token and resolves role strictly from database", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // Malicious client tries to send role='admin'
      const res = await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "valid-viewer-token", role: "admin" });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe("viewer"); // True database role enforced!
    });

    it("blocks Viewer from uploading documents (403)", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      await agent
        .post("/api/auth/firebase-login")
        .set("X-CSRF-Token", csrf)
        .send({ idToken: "valid-viewer-token" });

      const postCsrf = await getCsrfToken(agent);
      const uploadRes = await agent
        .post("/api/documents")
        .set("X-CSRF-Token", postCsrf)
        .attach("file", Buffer.from("%PDF-1.4 test document"), "test.pdf")
        .field("name", "Test Doc");

      expect(uploadRes.status).toBe(403);
      expect(uploadRes.body.error).toMatch(/viewers cannot upload documents/i);
    });
  });

  // =========================================================================
  // 4. END-TO-END SESSION LIFECYCLE & PERSISTENCE
  // =========================================================================
  describe("4. End-to-End Session Lifecycle", () => {
    it("persists authenticated session across page refresh via GET /api/auth/me", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({ username: adminUser.name, password: testPassword });

      // Emulate page refresh
      const meRes = await agent.get("/api/auth/me");
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe(adminUser.email);
      expect(meRes.body.user.role).toBe("admin");
    });

    it("invalidates session completely upon logout", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({ username: adminUser.name, password: testPassword });

      const logoutCsrf = await getCsrfToken(agent);
      const logoutRes = await agent
        .post("/api/auth/logout")
        .set("X-CSRF-Token", logoutCsrf);

      expect(logoutRes.status).toBe(200);

      // Subsequent call to /api/auth/me returns 401
      const meAfterLogout = await agent.get("/api/auth/me");
      expect(meAfterLogout.status).toBe(401);
    });

    it("rejects requests missing session authentication with 401", async () => {
      const unauthAgent = request.agent(app);
      const res = await unauthAgent.get("/api/documents");
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/authentication required/i);
    });
  });
});
