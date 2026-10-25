// Test login throttling / rate limiting
process.env.RATE_LIMIT_LOGIN = "3";
const request = require("supertest");
const app = require("../server");

describe("TrustVault Authentication Rate Limiting & Throttling", () => {
  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    return res.body.csrfToken;
  }

  it("appropriately throttles repeated invalid login attempts with 429 Too Many Requests", async () => {
    const agent = request.agent(app);

    // Attempts 1, 2, 3 return 401
    for (let i = 0; i < 3; i++) {
      const csrf = await getCsrfToken(agent);
      const res = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrf)
        .send({ username: "bruteforce_target", password: `invalid_pwd_${i}` });
      expect(res.status).toBe(401);
    }

    // 4th attempt exceeds limit of 3 -> returns 429
    const csrf4 = await getCsrfToken(agent);
    const throttledRes = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrf4)
      .send({ username: "bruteforce_target", password: "invalid_pwd_4" });

    expect(throttledRes.status).toBe(429);
    expect(throttledRes.body.error).toMatch(/too many login attempts/i);
  });
});
