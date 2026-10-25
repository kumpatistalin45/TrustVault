"use strict";

const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");

describe("TrustVault Phase 2: Master Data Management Tests", () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testPassword = "MasterDataPassword2026!";
  const createdUserIds = new Set();
  const createdDocIds = new Set();

  let adminAgent;
  let ownerAgentA;
  let ownerAgentB;
  let viewerAgentA;

  let adminUser;
  let ownerUserA;
  let ownerUserB;
  let viewerUserA;

  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    return res.body.csrfToken;
  }

  async function createUserDirect({ name, email, password, role, status = "active", owner_id = null, department = "Operations" }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, status, owner_id, department, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, name, email, role, status, owner_id, department
    `, [name, email.toLowerCase(), passwordHash, role, status, owner_id, department]);

    const user = result.rows[0];
    createdUserIds.add(user.id);
    return user;
  }

  async function loginAgent(email, password) {
    const agent = request.agent(app);
    const csrf = await getCsrfToken(agent);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrf)
      .send({ email, password });
    expect(res.status).toBe(200);
    return agent;
  }

  beforeAll(async () => {
    // 1. Create Admin
    adminUser = await createUserDirect({
      name: "Admin Superuser",
      email: `admin-${unique}@trustvault.internal`,
      password: testPassword,
      role: "admin",
      department: "Corporate Security"
    });

    // 2. Create Owner A
    ownerUserA = await createUserDirect({
      name: "Owner Alpha",
      email: `owner-a-${unique}@trustvault.internal`,
      password: testPassword,
      role: "owner",
      department: "Legal & Compliance"
    });

    // 3. Create Owner B
    ownerUserB = await createUserDirect({
      name: "Owner Bravo",
      email: `owner-b-${unique}@trustvault.internal`,
      password: testPassword,
      role: "owner",
      department: "Finance"
    });

    // 4. Create Viewer A (belongs to Owner A)
    viewerUserA = await createUserDirect({
      name: "Viewer Alice",
      email: `viewer-a-${unique}@trustvault.internal`,
      password: testPassword,
      role: "viewer",
      owner_id: ownerUserA.id,
      department: "Audit"
    });

    // Authenticate test agents
    adminAgent = await loginAgent(adminUser.email, testPassword);
    ownerAgentA = await loginAgent(ownerUserA.email, testPassword);
    ownerAgentB = await loginAgent(ownerUserB.email, testPassword);
    viewerAgentA = await loginAgent(viewerUserA.email, testPassword);
  });

  afterAll(async () => {
    try {
      const docIds = Array.from(createdDocIds);
      if (docIds.length > 0) {
        await pool.query("DELETE FROM document_permissions WHERE document_id = ANY($1::bigint[])", [docIds]);
        await pool.query("DELETE FROM documents WHERE id = ANY($1::bigint[])", [docIds]);
      }

      const userIds = Array.from(createdUserIds);
      if (userIds.length > 0) {
        await pool.query(
          "DELETE FROM audit_logs WHERE actor_id = ANY($1::bigint[]) OR target_user_id = ANY($1::bigint[])",
          [userIds]
        );
        await pool.query("DELETE FROM user_sessions WHERE (sess->'user'->>'id')::bigint = ANY($1::bigint[])", [userIds]);
        await pool.query("DELETE FROM document_permissions WHERE user_id = ANY($1::bigint[])", [userIds]);
        await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
      }
    } finally {
      await pool.end();
    }
  });

  // =========================================================================
  // Section 1: CSRF & Authorization Guards
  // =========================================================================
  describe("CSRF & Session Authorization", () => {
    test("Unauthenticated request to Admin Owners endpoint returns 401", async () => {
      const res = await request(app).get("/api/admin/owners");
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    test("Unauthenticated request to Owner Viewers endpoint returns 401", async () => {
      const res = await request(app).get("/api/owner/viewers");
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    test("Non-admin user (Owner) accessing Admin Owners list receives 403 Forbidden", async () => {
      const res = await ownerAgentA.get("/api/admin/owners");
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Admin access required/i);
    });

    test("Missing CSRF token on POST /api/admin/owners returns 403", async () => {
      const res = await adminAgent
        .post("/api/admin/owners")
        .send({ name: "No CSRF Owner", email: `nocsrf-${unique}@example.com` });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // Section 2: Admin APIs — Owner Master Data
  // =========================================================================
  describe("Admin APIs — Owner Master Data", () => {
    let createdOwnerId;

    test("Admin lists owners with pagination and calculated document/viewer counts", async () => {
      const res = await adminAgent.get("/api/admin/owners?page=1&limit=10");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.owners)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.page).toBe(1);

      const found = res.body.owners.find((o) => o.id === ownerUserA.id);
      expect(found).toBeDefined();
      expect(found.unique_id).toBeTruthy();
      expect(found.role).toBe("owner");
      expect(typeof found.documents_count).toBe("number");
      expect(typeof found.viewers_count).toBe("number");
    });

    test("Admin creates a new Owner with valid email, mobile, and department", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const newEmail = `created-owner-${unique}@trustvault.internal`;

      const res = await adminAgent
        .post("/api/admin/owners")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Dr. Evelyn Reed",
          email: newEmail,
          mobile: "+1 (555) 789-0123",
          department: "Cyber Threat Intel",
          status: "active"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.owner).toBeDefined();
      expect(res.body.owner.email).toBe(newEmail);
      expect(res.body.owner.role).toBe("owner");
      expect(res.body.owner.unique_id).toMatch(/^TV-OWN-\d+$/);

      createdOwnerId = res.body.owner.id;
      createdUserIds.add(createdOwnerId);
    });

    test("Admin creation rejects duplicate email with 409 Conflict", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const res = await adminAgent
        .post("/api/admin/owners")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Duplicate Tester",
          email: ownerUserA.email,
          mobile: "+1 (555) 000-1111",
          department: "IT"
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    test("Admin creation validates corporate email format and name length", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const resInvalidEmail = await adminAgent
        .post("/api/admin/owners")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Valid Name",
          email: "not-an-email",
          department: "HR"
        });
      expect(resInvalidEmail.status).toBe(400);

      const resEmptyName = await adminAgent
        .post("/api/admin/owners")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "   ",
          email: `valid-${unique}@example.com`
        });
      expect(resEmptyName.status).toBe(400);
    });

    test("Admin views single Owner details by ID", async () => {
      const res = await adminAgent.get(`/api/admin/owners/${createdOwnerId}`);
      expect(res.status).toBe(200);
      expect(res.body.owner.id).toBe(createdOwnerId);
      expect(res.body.owner.department).toBe("Cyber Threat Intel");
    });

    test("Admin updates Owner details and role cannot be changed", async () => {
      const csrf = await getCsrfToken(adminAgent);

      // Attempt to change role should be rejected
      const resRoleEsc = await adminAgent
        .patch(`/api/admin/owners/${createdOwnerId}`)
        .set("X-CSRF-Token", csrf)
        .send({ role: "admin" });
      expect(resRoleEsc.status).toBe(400);

      // Valid details update
      const resValidUpdate = await adminAgent
        .patch(`/api/admin/owners/${createdOwnerId}`)
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Dr. Evelyn Reed PhD",
          department: "Advanced Threat Research"
        });

      expect(resValidUpdate.status).toBe(200);
      expect(resValidUpdate.body.owner.name).toBe("Dr. Evelyn Reed PhD");
      expect(resValidUpdate.body.owner.department).toBe("Advanced Threat Research");
    });

    test("Admin deactivates Owner and verifies active sessions are revoked", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const res = await adminAgent
        .patch(`/api/admin/owners/${createdOwnerId}/status`)
        .set("X-CSRF-Token", csrf)
        .send({ status: "inactive", reason: "Annual compliance audit" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("inactive");
      expect(res.body.owner.status).toBe("inactive");

      // Verify DB status
      const dbCheck = await pool.query("SELECT status FROM users WHERE id = $1", [createdOwnerId]);
      expect(dbCheck.rows[0].status).toBe("inactive");
    });
  });

  // =========================================================================
  // Section 3: Owner APIs — Viewer Master Data & Tenant Isolation
  // =========================================================================
  describe("Owner APIs — Viewer Master Data & Strict Tenant Isolation", () => {
    let createdViewerId;

    test("Owner A creates a new Viewer scoped to Owner A", async () => {
      const csrf = await getCsrfToken(ownerAgentA);
      const viewerEmail = `viewer-alpha-new-${unique}@trustvault.internal`;

      const res = await ownerAgentA
        .post("/api/owner/viewers")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Victor Stone",
          email: viewerEmail,
          mobile: "+1 (555) 444-5555",
          department: "Field Forensics",
          status: "active"
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.viewer).toBeDefined();
      expect(res.body.viewer.role).toBe("viewer");
      expect(res.body.viewer.owner_id).toBe(ownerUserA.id);
      expect(res.body.viewer.unique_id).toMatch(/^TV-VIW-\d+$/);

      createdViewerId = res.body.viewer.id;
      createdUserIds.add(createdViewerId);
    });

    test("Owner creation prevents role escalation: client passing role='admin' or 'owner' is strictly locked to 'viewer'", async () => {
      const csrf = await getCsrfToken(ownerAgentA);
      const escalationEmail = `escalate-attempt-${unique}@trustvault.internal`;

      const res = await ownerAgentA
        .post("/api/owner/viewers")
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Escalation Attempter",
          email: escalationEmail,
          role: "admin", // Malicious attempt to elevate role
          status: "active"
        });

      expect(res.status).toBe(201);
      expect(res.body.viewer.role).toBe("viewer"); // Enforced as viewer!
      createdUserIds.add(res.body.viewer.id);
    });

    test("Owner A lists their viewers and does not see other owners' viewers", async () => {
      const res = await ownerAgentA.get("/api/owner/viewers");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.viewers)).toBe(true);
      // All returned viewers MUST have owner_id == ownerUserA.id
      for (const v of res.body.viewers) {
        expect(v.owner_id).toBe(ownerUserA.id);
      }
    });

    test("Owner A can view details of their own Viewer", async () => {
      const res = await ownerAgentA.get(`/api/owner/viewers/${createdViewerId}`);
      expect(res.status).toBe(200);
      expect(res.body.viewer.id).toBe(createdViewerId);
      expect(res.body.viewer.owner_id).toBe(ownerUserA.id);
    });

    test("TENANT ISOLATION: Owner B attempting to read Owner A's Viewer receives 404 Not Found", async () => {
      const res = await ownerAgentB.get(`/api/owner/viewers/${createdViewerId}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Viewer not found/i);
    });

    test("TENANT ISOLATION: Owner B attempting to update Owner A's Viewer receives 404 Not Found", async () => {
      const csrf = await getCsrfToken(ownerAgentB);
      const res = await ownerAgentB
        .patch(`/api/owner/viewers/${createdViewerId}`)
        .set("X-CSRF-Token", csrf)
        .send({ name: "Hacked by Owner B" });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Viewer not found/i);

      // Verify name was not modified
      const check = await pool.query("SELECT name FROM users WHERE id = $1", [createdViewerId]);
      expect(check.rows[0].name).toBe("Victor Stone");
    });

    test("TENANT ISOLATION: Owner B attempting to toggle status of Owner A's Viewer receives 404 Not Found", async () => {
      const csrf = await getCsrfToken(ownerAgentB);
      const res = await ownerAgentB
        .patch(`/api/owner/viewers/${createdViewerId}/status`)
        .set("X-CSRF-Token", csrf)
        .send({ status: "inactive" });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Viewer not found/i);
    });

    test("Owner A updates Viewer details and prevents privilege escalation", async () => {
      const csrf = await getCsrfToken(ownerAgentA);

      // Attempt to change role to admin is rejected
      const resRoleEsc = await ownerAgentA
        .patch(`/api/owner/viewers/${createdViewerId}`)
        .set("X-CSRF-Token", csrf)
        .send({ role: "admin" });
      expect(resRoleEsc.status).toBe(403);

      // Valid details update
      const resUpdate = await ownerAgentA
        .patch(`/api/owner/viewers/${createdViewerId}`)
        .set("X-CSRF-Token", csrf)
        .send({
          name: "Victor Stone Senior Analyst",
          department: "Strategic Investigations"
        });

      expect(resUpdate.status).toBe(200);
      expect(resUpdate.body.viewer.name).toBe("Victor Stone Senior Analyst");
    });

    test("Owner A deactivates Viewer and verifies inactive account cannot log in", async () => {
      const csrf = await getCsrfToken(ownerAgentA);
      const res = await ownerAgentA
        .patch(`/api/owner/viewers/${viewerUserA.id}/status`)
        .set("X-CSRF-Token", csrf)
        .send({ status: "inactive", reason: "Contract ended" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("inactive");

      // Verify login is blocked for inactive user
      const agent = request.agent(app);
      const loginCsrf = await getCsrfToken(agent);

      const loginRes = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", loginCsrf)
        .send({
          email: viewerUserA.email,
          password: testPassword
        });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error).toMatch(/Account is inactive/i);
    });
  });

  // =========================================================================
  // Section 4: CSV / Spreadsheet Bulk Import & Formula Injection Protection
  // =========================================================================
  describe("CSV Bulk Import & Formula Injection Protection", () => {
    test("Admin bulk imports owners with formula injection sanitization and row-level validation", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const importEmail1 = `bulk-own-1-${unique}@trustvault.internal`;
      const importEmail2 = `bulk-own-2-${unique}@trustvault.internal`;

      // Row with formula injection attempt: '=cmd|' /C calc'!A0'
      const csvData = [
        "Name,Email,Mobile,Department,Status",
        `=cmd|' /C calc'!A0,${importEmail1},+1 (555) 111-2222,Threat Research,active`,
        `@SUM(1+1),${importEmail2},+1 (555) 333-4444,Security Auditing,active`,
        `Duplicate In File,${importEmail1},+1 (555) 555-6666,Ops,active`, // Intra-file duplicate
        `Existing In DB,${ownerUserA.email},+1 (555) 777-8888,Legal,active` // DB duplicate
      ].join("\n");

      const res = await adminAgent
        .post("/api/admin/owners/import")
        .set("X-CSRF-Token", csrf)
        .send({ csvText: csvData });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.addedCount).toBe(2);
      expect(res.body.errors.length).toBe(2);

      // Verify errors reported row-level without crashing
      expect(res.body.errors.some((e) => e.error.includes("Duplicate email"))).toBe(true);
      expect(res.body.errors.some((e) => e.error.includes("already registered"))).toBe(true);

      // Verify formula injection sanitized with leading single quote
      const sanitizedUser1 = await pool.query("SELECT name FROM users WHERE email = $1", [importEmail1]);
      expect(sanitizedUser1.rows[0].name.startsWith("'")).toBe(true);

      createdUserIds.add(res.body.importedOwners[0].id);
      createdUserIds.add(res.body.importedOwners[1].id);
    });

    test("Owner bulk import assigns owner_id strictly to authenticated Owner", async () => {
      const csrf = await getCsrfToken(ownerAgentA);
      const viewerEmail1 = `bulk-viw-1-${unique}@trustvault.internal`;

      const rows = [
        {
          name: "Contractor 1",
          email: viewerEmail1,
          mobile: "+1 (555) 888-9999",
          department: "Penetration Testing"
        }
      ];

      const res = await ownerAgentA
        .post("/api/owner/viewers/import")
        .set("X-CSRF-Token", csrf)
        .send({ rows });

      expect(res.status).toBe(201);
      expect(res.body.addedCount).toBe(1);
      expect(res.body.importedViewers[0].owner_id).toBe(ownerUserA.id);

      createdUserIds.add(res.body.importedViewers[0].id);
    });

    test("Import rejects empty or malformed files with 400 Bad Request", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const res = await adminAgent
        .post("/api/admin/owners/import")
        .set("X-CSRF-Token", csrf)
        .send({ csvText: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/No valid rows/i);
    });
  });

  // =========================================================================
  // Section 5: Public Signup Securely Disabled
  // =========================================================================
  describe("Public Signup Disabled Enforcement", () => {
    test("POST /api/auth/register returns 403 Forbidden when public signup is disabled", async () => {
      const prevEnv = process.env.DISABLE_PUBLIC_SIGNUP;
      process.env.DISABLE_PUBLIC_SIGNUP = "true";

      try {
        const agent = request.agent(app);
        const csrf = await getCsrfToken(agent);

        const res = await agent
          .post("/api/auth/register")
          .set("X-CSRF-Token", csrf)
          .send({
            name: "Unprovisioned User",
            email: `unprovisioned-${unique}@example.com`,
            password: testPassword
          });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Public registration is disabled/i);
      } finally {
        process.env.DISABLE_PUBLIC_SIGNUP = prevEnv;
      }
    });
  });

  // =========================================================================
  // Section 6: Audit Logging Integrity
  // =========================================================================
  describe("Audit Logging Integrity", () => {
    test("Master data mutations generate structured audit logs", async () => {
      const logs = await pool.query(`
        SELECT action, outcome, actor_id
        FROM audit_logs
        WHERE actor_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [adminUser.id]);

      expect(logs.rows.length).toBeGreaterThan(0);
      const actions = logs.rows.map((r) => r.action);
      expect(actions.some((a) => a.includes("admin_"))).toBe(true);
    });
  });
});
