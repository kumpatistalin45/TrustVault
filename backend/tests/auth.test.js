
const request = require("supertest");
const app = require("../server");
const pool = require("../db");

describe("TrustVault API security tests", () => {
  // Close the PostgreSQL pool after all tests finish.
  afterAll(async () => {
    await pool.end();
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

  // 7. CSRF protection
  test("Invalid CSRF token blocks logout request", async () => {
    const agent = request.agent(app);

    // Establish an anonymous session and obtain its cookies.
    const tokenResponse = await agent.get("/api/auth/csrf-token");

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.csrfToken).toBeTruthy();

    // A deliberately invalid token must not authorize a POST.
    const response = await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", "deliberately-invalid-token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Invalid CSRF token"
    });
  });
});
