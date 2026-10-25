const request = require("supertest");
const app = require("../server");
const pool = require("../db");

describe("TrustVault Authentication, Sessions & Security Tests", () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const testPassword = "SuperSecurePassword2026!";
  const createdUserIds = new Set();
  const createdEmails = new Set();

  async function getCsrfToken(agent) {
    const response = await agent.get("/api/auth/csrf-token");
    expect(response.status).toBe(200);
    expect(response.body.csrfToken).toBeTruthy();
    return response.body.csrfToken;
  }

  afterAll(async () => {
    try {
      const userIds = Array.from(createdUserIds);
      if (userIds.length > 0) {
        await pool.query(
          `DELETE FROM audit_logs
           WHERE actor_id = ANY($1::bigint[])
              OR target_user_id = ANY($1::bigint[])`,
          [userIds]
        );

        await pool.query(
          "DELETE FROM users WHERE id = ANY($1::bigint[])",
          [userIds]
        );
      }

      if (createdEmails.size > 0) {
        await pool.query(
          "DELETE FROM users WHERE email = ANY($1::text[])",
          [Array.from(createdEmails)]
        );
      }
    } finally {
      await pool.end();
    }
  });

  // 1. Health endpoint
  test("GET /health returns 200 OK", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  // 2. Database readiness
  test("GET /health/ready confirms database connection", async () => {
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      database: "connected"
    });
  });

  // 3. Authentication required for profile
  test("Unauthenticated user cannot access profile", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Authentication required"
    });
  });

  // 4. Authentication required for document listing
  test("Unauthenticated user cannot list documents", async () => {
    const response = await request(app).get("/api/documents");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Authentication required"
    });
  });

  // 5. Authentication required for document metadata
  test("Unauthenticated user cannot read document metadata", async () => {
    const response = await request(app).get("/api/documents/1");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Authentication required"
    });
  });

  // 6. Unknown routes
  test("Unknown endpoint returns 404", async () => {
    const response = await request(app).get("/not-a-real-route");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "Not found"
    });
  });

  // 7. CSRF protection on state-changing requests
  test("Missing CSRF token blocks logout request", async () => {
    const agent = request.agent(app);
    await agent.get("/api/auth/csrf-token");

    const response = await agent
      .post("/api/auth/logout")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Invalid CSRF token"
    });
  });

  test("Invalid CSRF token blocks logout request", async () => {
    const agent = request.agent(app);
    await getCsrfToken(agent);

    const response = await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", "deliberately-invalid-token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Invalid CSRF token"
    });
  });

  // 8. User registration validation
  test("Registration rejects missing or invalid name", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "   ",
        email: `invalid-name-${unique}@example.com`,
        password: testPassword
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Valid name is required"
    });
  });

  test("Registration rejects invalid email format", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Valid Name",
        email: "not-a-real-email",
        password: testPassword
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Valid email is required"
    });
  });

  test("Registration rejects password shorter than 12 bytes", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Short Pass",
        email: `shortpass-${unique}@example.com`,
        password: "short"
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Password must be between 12 and 72 UTF-8 bytes"
    });
  });

  test("Registration rejects password longer than 72 bytes", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const longPassword = "A".repeat(73);
    const response = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Long Pass",
        email: `longpass-${unique}@example.com`,
        password: longPassword
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Password must be between 12 and 72 UTF-8 bytes"
    });
  });

  // 9. Successful registration and duplicate account prevention
  test("Successful user registration creates owner account and logs audit event", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);
    const email = `reg-success-${unique}@example.com`;
    createdEmails.add(email);

    const response = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Registration Test User",
        email,
        password: testPassword
      });

    expect(response.status).toBe(201);
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe(email);
    expect(response.body.user.role).toBe("owner");
    expect(response.body.user.password_hash).toBeUndefined();

    createdUserIds.add(response.body.user.id);

    const audit = await pool.query(
      `SELECT action, outcome, actor_id
       FROM audit_logs
       WHERE actor_id = $1 AND action = 'auth_register'`,
      [response.body.user.id]
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("success");
  });

  test("Duplicate account registration returns 409 Conflict without leaking secrets", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);
    const email = `reg-dup-${unique}@example.com`;
    createdEmails.add(email);

    const firstResponse = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "First User",
        email,
        password: testPassword
      });

    expect(firstResponse.status).toBe(201);
    createdUserIds.add(firstResponse.body.user.id);

    const duplicateResponse = await agent
      .post("/api/auth/register")
      .set("X-CSRF-Token", csrfToken)
      .send({
        name: "Duplicate User",
        email,
        password: testPassword
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toEqual({
      error: "An account with this email already exists"
    });
  });

  // 10. Login, session regeneration, profile access, and logout invalidation
  test("Invalid credentials return 401 and write audit log", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({
        email: `nonexistent-${unique}@example.com`,
        password: "WrongPassword123!"
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid email or password"
    });

    const audit = await pool.query(
      `SELECT action, outcome
       FROM audit_logs
       WHERE action = 'auth_login' AND outcome = 'failure'
       ORDER BY id DESC LIMIT 1`
    );

    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("failure");
  });

  test("Successful login regenerates session, refreshes CSRF token, and allows profile access", async () => {
    const bcrypt = require("bcrypt");
    const agent = request.agent(app);
    const initialCsrfToken = await getCsrfToken(agent);
    const email = `login-flow-${unique}@example.com`;
    createdEmails.add(email);

    const hash = await bcrypt.hash(testPassword, 12);
    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Login Flow User', $1, $2, 'owner')
       RETURNING id, email`,
      [email, hash]
    );

    const userId = userResult.rows[0].id;
    createdUserIds.add(userId);

    // Login with credentials
    const loginResponse = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", initialCsrfToken)
      .send({
        email,
        password: testPassword
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user).toBeDefined();
    expect(String(loginResponse.body.user.id)).toBe(String(userId));
    expect(loginResponse.body.csrfToken).toBeTruthy();

    // Verify session regeneration and profile access
    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(email);
    expect(String(meResponse.body.user.id)).toBe(String(userId));

    // Logout invalidates the server session
    const postLoginCsrf = loginResponse.body.csrfToken;
    const logoutResponse = await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", postLoginCsrf)
      .send({});

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({
      message: "Logged out successfully"
    });

    // Profile access after logout MUST fail with 401
    const postLogoutMe = await agent.get("/api/auth/me");
    expect(postLogoutMe.status).toBe(401);
    expect(postLogoutMe.body).toEqual({
      error: "Authentication required"
    });
  });

  // 11. Rate limiting on registration
  test("Registration rate limiting enforces maximum attempt limit", async () => {
    const agent = request.agent(app);
    let blockedResponse = null;
    const rateLimitIp = "198.51.100.99";

    for (let i = 0; i < 15; i++) {
      const csrf = await getCsrfToken(agent);
      const res = await agent
        .post("/api/auth/register")
        .set("X-CSRF-Token", csrf)
        .set("X-Forwarded-For", rateLimitIp)
        .send({
          name: `Rate Limit Test ${i}`,
          email: `ratelimit-${i}-${unique}@example.com`,
          password: testPassword
        });

      if (res.status === 429) {
        blockedResponse = res;
        break;
      } else if (res.status === 201) {
        createdUserIds.add(res.body.user.id);
      }
    }

    expect(blockedResponse).not.toBeNull();
    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.error).toContain("Too many registration attempts");
  }, 20000);
});
