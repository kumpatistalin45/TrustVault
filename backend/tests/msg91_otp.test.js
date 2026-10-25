const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");
const {
  normalizePhoneNumber,
  isMsg91Configured,
  sendOtp,
  verifyOtp,
  retryOtp,
  checkRequestCooldownAndLimits,
  recordOtpRequest,
  checkVerifyAttempts,
  recordFailedAttempt,
  clearVerifyAttempts,
  clearTrackers,
  setMockHandler,
  resetMockHandler
} = require("../msg91Service");

describe("TrustVault MSG91 Mobile OTP Verification Test Suite", () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const defaultPassword = "OtpIntegrationPassword2026!";
  const createdUserIds = new Set();

  let testAgent;
  let testUserId;
  let testUserEmail;
  const testMobile = "9876543210";
  const normalizedTestMobile = "919876543210";

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

  beforeAll(async () => {
    // Ensure test environment uses placeholder MSG91 config for tests if not set
    process.env.MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || "mock_msg91_auth_key_test_123456";
    process.env.MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || "mock_template_id_67890";

    const hash = await bcrypt.hash(defaultPassword, 10);
    testUserEmail = `otp-user-${unique}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at, mobile, phone_verified)
       VALUES ('OTP Test User', $1, $2, 'owner', 'active', '2026.1', NOW(), $3, FALSE)
       RETURNING id`,
      [testUserEmail, hash, testMobile]
    );
    testUserId = userRes.rows[0].id;
    createdUserIds.add(testUserId);

    testAgent = request.agent(app);
    const loginRes = await login(testAgent, testUserEmail);
    expect(loginRes.status).toBe(200);
  });

  afterAll(async () => {
    try {
      if (createdUserIds.size > 0) {
        const ids = Array.from(createdUserIds);
        await pool.query(
          "DELETE FROM audit_logs WHERE actor_id = ANY($1::bigint[]) OR target_user_id = ANY($1::bigint[])",
          [ids]
        );
        await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [ids]);
      }
    } catch (e) {
      console.warn("Cleanup error in msg91_otp tests:", e.message);
    }
  });

  beforeEach(() => {
    clearTrackers();
    // Default mock handler for MSG91:
    // OTP "123456" succeeds; any other OTP fails
    setMockHandler(async ({ action, mobile, otp, retryType }) => {
      if (action === "send") {
        return {
          type: "success",
          message: "OTP sent successfully via mock handler",
          request_id: `mock_req_${Date.now()}`
        };
      }
      if (action === "verify") {
        if (otp === "123456") {
          return {
            type: "success",
            message: "OTP verified success"
          };
        }
        return {
          type: "error",
          message: "Mobile number or OTP not valid"
        };
      }
      if (action === "retry") {
        return {
          type: "success",
          message: `OTP resent via ${retryType || "text"}`
        };
      }
      return { type: "error", message: "Unknown action" };
    });
  });

  afterEach(() => {
    resetMockHandler();
  });

  // =========================================================================
  // 1. Phone Normalization Unit Tests
  // =========================================================================
  describe("Phone Normalization & Service Utilities", () => {
    test("normalizes 10-digit Indian numbers with standard prefix 91", () => {
      expect(normalizePhoneNumber("9876543210")).toBe("919876543210");
      expect(normalizePhoneNumber(" 98765 43210 ")).toBe("919876543210");
      expect(normalizePhoneNumber("987-654-3210")).toBe("919876543210");
    });

    test("normalizes numbers with leading 0 or +91", () => {
      expect(normalizePhoneNumber("09876543210")).toBe("919876543210");
      expect(normalizePhoneNumber("+919876543210")).toBe("919876543210");
      expect(normalizePhoneNumber("+91 98765-43210")).toBe("919876543210");
    });

    test("handles international E.164 formats without plus", () => {
      expect(normalizePhoneNumber("+14155552671")).toBe("14155552671");
      expect(normalizePhoneNumber("+447911123456")).toBe("447911123456");
    });

    test("throws descriptive error for invalid phone numbers", () => {
      expect(() => normalizePhoneNumber("")).toThrow("Mobile phone number is required.");
      expect(() => normalizePhoneNumber("   ")).toThrow("Mobile phone number is required.");
      expect(() => normalizePhoneNumber("12345")).toThrow("invalid length");
      expect(() => normalizePhoneNumber("abcdefghij")).toThrow("invalid length");
      expect(() => normalizePhoneNumber("12345678901234567890")).toThrow("invalid length");
    });

    test("isMsg91Configured correctly detects environment credentials", () => {
      expect(isMsg91Configured()).toBe(true);
    });
  });

  // =========================================================================
  // 2. Cooldown, Attempt Tracking, & Abuse Protection
  // =========================================================================
  describe("Rate Limiting & Abuse Prevention Logic", () => {
    const rateTestMobile = "919999988888";

    test("enforces 60-second cooldown on consecutive requests", () => {
      // First request passes
      const check1 = checkRequestCooldownAndLimits(rateTestMobile);
      expect(check1.allowed).toBe(true);
      recordOtpRequest(rateTestMobile);

      // Immediate second request is blocked by cooldown
      const check2 = checkRequestCooldownAndLimits(rateTestMobile);
      expect(check2.allowed).toBe(false);
      expect(check2.reason).toBe("cooldown");
      expect(check2.cooldownRemaining).toBeGreaterThan(0);
      expect(check2.cooldownRemaining).toBeLessThanOrEqual(60);
    });

    test("tracks failed verify attempts and locks out after 5 failures", () => {
      const verifyMobile = "918888877777";
      clearVerifyAttempts(verifyMobile);

      // Initial state: 5 remaining attempts
      const initialCheck = checkVerifyAttempts(verifyMobile);
      expect(initialCheck.allowed).toBe(true);
      expect(initialCheck.remainingAttempts).toBe(5);

      // 4 failures
      for (let i = 1; i <= 4; i++) {
        const remaining = recordFailedAttempt(verifyMobile);
        expect(remaining).toBe(5 - i);
      }

      // 5th failure triggers lockout (0 remaining)
      const remAfter5 = recordFailedAttempt(verifyMobile);
      expect(remAfter5).toBe(0);

      // Subsequent check confirms lockout
      const lockedCheck = checkVerifyAttempts(verifyMobile);
      expect(lockedCheck.allowed).toBe(false);
      expect(lockedCheck.lockoutRemaining).toBeGreaterThan(0);

      // Clear verify attempts resets state
      clearVerifyAttempts(verifyMobile);
      const afterClear = checkVerifyAttempts(verifyMobile);
      expect(afterClear.allowed).toBe(true);
      expect(afterClear.remainingAttempts).toBe(5);
    });
  });

  // =========================================================================
  // 3. MSG91 Service Direct Calls (Hermetic Mock Handler)
  // =========================================================================
  describe("Direct MSG91 Service Calls", () => {
    const directMobile = "919123456789";

    test("sendOtp returns success when provider responds positively", async () => {
      const res = await sendOtp({ mobile: directMobile });
      expect(res.success).toBe(true);
      expect(res.normalizedMobile).toBe(directMobile);
    });

    test("verifyOtp succeeds with correct 6-digit OTP", async () => {
      const res = await verifyOtp({ mobile: directMobile, otp: "123456" });
      expect(res.success).toBe(true);
      expect(res.message).toMatch(/success/i);
    });

    test("verifyOtp rejects incorrect OTP and reports remaining attempts", async () => {
      clearVerifyAttempts(directMobile);
      let caughtError = null;
      try {
        await verifyOtp({ mobile: directMobile, otp: "999999" });
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).not.toBeNull();
      expect(caughtError.remainingAttempts).toBe(4);
    });

    test("retryOtp delegates to mock handler with retryType", async () => {
      const retryMobile = "919555544444";
      const res = await retryOtp({ mobile: retryMobile, retryType: "voice" });
      expect(res.success).toBe(true);
      expect(res.message).toContain("voice");
    });
  });

  // =========================================================================
  // 4. API Endpoints Integration Tests (Supertest)
  // =========================================================================
  describe("Express Endpoints /api/auth/otp/*", () => {
    test("POST /api/auth/otp/send rejects missing or malformed mobile number", async () => {
      const csrfToken = await getCsrfToken(testAgent);
      const res1 = await testAgent
        .post("/api/auth/otp/send")
        .set("X-CSRF-Token", csrfToken)
        .send({});
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain("Mobile phone number is required");

      const res2 = await testAgent
        .post("/api/auth/otp/send")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: "123" });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain("invalid length");
    });

    test("POST /api/auth/otp/send successfully requests OTP", async () => {
      const uniqueMobile = "91" + Math.floor(1000000000 + Math.random() * 9000000000);
      const csrfToken = await getCsrfToken(testAgent);

      const res = await testAgent
        .post("/api/auth/otp/send")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: uniqueMobile });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.normalizedMobile).toBe(uniqueMobile);
      expect(res.body.message).toContain("sent successfully");
    });

    test("POST /api/auth/otp/send enforces 60-second cooldown with HTTP 429", async () => {
      const cooldownMobile = "917777766666";
      const csrfToken = await getCsrfToken(testAgent);

      const res1 = await testAgent
        .post("/api/auth/otp/send")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: cooldownMobile });
      expect(res1.status).toBe(200);

      // Second immediate request
      const res2 = await testAgent
        .post("/api/auth/otp/send")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: cooldownMobile });
      expect(res2.status).toBe(429);
      expect(res2.body.error).toContain("Please wait");
      expect(res2.body.remainingSeconds).toBeGreaterThan(0);
    });

    test("POST /api/auth/otp/verify validates 6-digit format strictly", async () => {
      const csrfToken = await getCsrfToken(testAgent);

      // Missing OTP
      const res1 = await testAgent
        .post("/api/auth/otp/verify")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: testMobile });
      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain("6 numeric digits");

      // Non-numeric OTP
      const res2 = await testAgent
        .post("/api/auth/otp/verify")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: testMobile, otp: "abcdef" });
      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain("6 numeric digits");

      // Wrong length (4 digits)
      const res3 = await testAgent
        .post("/api/auth/otp/verify")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: testMobile, otp: "1234" });
      expect(res3.status).toBe(400);
      expect(res3.body.error).toContain("6 numeric digits");
    });

    test("POST /api/auth/otp/verify returns HTTP 400 with remaining attempts on invalid OTP", async () => {
      const verifyMobile = "916666655555";
      clearVerifyAttempts(verifyMobile);
      const csrfToken = await getCsrfToken(testAgent);

      const res = await testAgent
        .post("/api/auth/otp/verify")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: verifyMobile, otp: "000000" });

      expect(res.status).toBe(400);
      expect(res.body.remainingAttempts).toBe(4);
    });

    test("POST /api/auth/otp/verify locks out after 5 consecutive failures", async () => {
      const lockoutMobile = "915555544444";
      clearVerifyAttempts(lockoutMobile);
      const csrfToken = await getCsrfToken(testAgent);

      for (let i = 0; i < 5; i++) {
        await testAgent
          .post("/api/auth/otp/verify")
          .set("X-CSRF-Token", csrfToken)
          .send({ mobile: lockoutMobile, otp: "000000" });
      }

      // 6th attempt is blocked with 429
      const lockedRes = await testAgent
        .post("/api/auth/otp/verify")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: lockoutMobile, otp: "123456" });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toContain("Too many failed verification attempts");
    });

    test("POST /api/auth/otp/verify succeeds, updates PostgreSQL database, and sets phone_verified", async () => {
      const csrfToken = await getCsrfToken(testAgent);

      // Verify OTP "123456" for authenticated user
      const res = await testAgent
        .post("/api/auth/otp/verify")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: testMobile, otp: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.phone_verified).toBe(true);

      // Inspect PostgreSQL directly
      const dbCheck = await pool.query(
        "SELECT mobile, phone_verified, phone_verified_at FROM users WHERE id = $1",
        [testUserId]
      );
      expect(dbCheck.rows[0].phone_verified).toBe(true);
      expect(dbCheck.rows[0].phone_verified_at).not.toBeNull();
      expect(dbCheck.rows[0].mobile).toBe(normalizedTestMobile);

      // Verify audit log was recorded
      const logCheck = await pool.query(
        "SELECT * FROM audit_logs WHERE actor_id = $1 AND action = 'phone_verification' ORDER BY id DESC LIMIT 1",
        [testUserId]
      );
      expect(logCheck.rows.length).toBeGreaterThan(0);
      expect(logCheck.rows[0].outcome).toBe("success");
    });

    test("GET /api/auth/otp/status returns verified phone status for authenticated session", async () => {
      const res = await testAgent.get("/api/auth/otp/status");
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.phone_verified).toBe(true);
      expect(res.body.mobile).toBe(normalizedTestMobile);
      expect(res.body.phone_verified_at).not.toBeNull();
    });

    test("GET /api/auth/otp/status returns HTTP 401 for unauthenticated request", async () => {
      const unauthAgent = request(app);
      const res = await unauthAgent.get("/api/auth/otp/status");
      expect(res.status).toBe(401);
    });

    test("Updating mobile via PATCH /api/users/profile resets phone_verified to FALSE", async () => {
      const csrfToken = await getCsrfToken(testAgent);

      // Update mobile number
      const newPhone = "919876500000";
      const patchRes = await testAgent
        .patch("/api/users/profile")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: newPhone });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.user.mobile).toBe(newPhone);
      expect(patchRes.body.user.phone_verified).toBe(false);

      // Verify DB column was reset
      const dbCheck = await pool.query(
        "SELECT mobile, phone_verified, phone_verified_at FROM users WHERE id = $1",
        [testUserId]
      );
      expect(dbCheck.rows[0].mobile).toBe(newPhone);
      expect(dbCheck.rows[0].phone_verified).toBe(false);
      expect(dbCheck.rows[0].phone_verified_at).toBeNull();
    });

    test("POST /api/auth/otp/retry sends retry code and enforces cooldown", async () => {
      const retryMobile = "914444433333";
      const csrfToken = await getCsrfToken(testAgent);

      // First retry request
      const res1 = await testAgent
        .post("/api/auth/otp/retry")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: retryMobile, retryType: "text" });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.message).toContain("text");

      // Immediate retry request fails with cooldown (429)
      const res2 = await testAgent
        .post("/api/auth/otp/retry")
        .set("X-CSRF-Token", csrfToken)
        .send({ mobile: retryMobile, retryType: "voice" });

      expect(res2.status).toBe(429);
      expect(res2.body.error).toContain("Please wait");
    });
  });
});
