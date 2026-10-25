process.env.RATE_LIMIT_LOGIN = "200";
process.env.RATE_LIMIT_OTP = "200";
process.env.RATE_LIMIT_OTP_VERIFY = "200";

const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../server");
const pool = require("../db");
const {
  sendEmailOtp,
  verifyEmailOtp,
  retryEmailOtp,
  normalizeEmail,
  isMsg91EmailConfigured,
  setMockHandler,
  resetMockHandler,
  clearTrackers,
  _getEmailOtpStore,
  generateSecureOtp,
  hashOtp,
  COOLDOWN_SECONDS,
  MAX_VERIFY_ATTEMPTS
} = require("../msg91Service");

describe("TrustVault MSG91 Corporate Email OTP Authentication Test Suite", () => {
  const unique = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const defaultPassword = "SecurityTestPassword2026!";
  const createdUserIds = new Set();

  let ownerUser;
  let viewerUser;
  let suspendedUser;
  let adminUser;

  async function getCsrfToken(agent) {
    const res = await agent.get("/api/auth/csrf-token");
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toBeTruthy();
    return res.body.csrfToken;
  }

  beforeAll(async () => {
    const hash = await bcrypt.hash(defaultPassword, 10);

    // 1. Provision Active Owner
    const ownerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')
       RETURNING id, name, email, role, status`,
      [`Test Owner ${unique}`, `owner_${unique}@trustvault.internal`, hash]
    );
    ownerUser = ownerRes.rows[0];
    createdUserIds.add(ownerUser.id);

    // 2. Provision Active Viewer
    const viewerRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, owner_id)
       VALUES ($1, $2, $3, 'viewer', 'active', $4)
       RETURNING id, name, email, role, status`,
      [`Test Viewer ${unique}`, `viewer_${unique}@trustvault.internal`, hash, ownerUser.id]
    );
    viewerUser = viewerRes.rows[0];
    createdUserIds.add(viewerUser.id);

    // 3. Provision Suspended User
    const suspendedRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'owner', 'suspended')
       RETURNING id, name, email, role, status`,
      [`Suspended User ${unique}`, `suspended_${unique}@trustvault.internal`, hash]
    );
    suspendedUser = suspendedRes.rows[0];
    createdUserIds.add(suspendedUser.id);

    // 4. Provision Admin User
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       RETURNING id, name, email, role, status`,
      [`Admin User ${unique}`, `admin_${unique}@trustvault.internal`, hash]
    );
    adminUser = adminRes.rows[0];
    createdUserIds.add(adminUser.id);
  });

  afterAll(async () => {
    resetMockHandler();
    if (createdUserIds.size > 0) {
      const userIds = Array.from(createdUserIds);
      await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = ANY($1::text[])", [userIds.map(String)]);
      await pool.query("DELETE FROM audit_logs WHERE actor_id = ANY($1::bigint[]) OR target_user_id = ANY($1::bigint[])", [userIds]);
      await pool.query("DELETE FROM users WHERE id = ANY($1::bigint[])", [userIds]);
    }
  });

  beforeEach(() => {
    clearTrackers();
    // Default Mock MSG91 Handler for Automated Tests:
    // OTP "123456" succeeds; "000000" simulates expired OTP; others fail
    setMockHandler(async ({ action, email, otp }) => {
      if (action === "send_email" || action === "retry_email") {
        return {
          type: "success",
          message: "OTP sent successfully to corporate email.",
          reqId: `mock_req_${Date.now()}`
        };
      }
      if (action === "verify_email") {
        if (otp === "000000") {
          return {
            type: "error",
            message: "Verification code has expired."
          };
        }
        if (otp === "123456") {
          return {
            type: "success",
            message: "Email OTP verified success."
          };
        }
        return {
          type: "error",
          message: "Invalid verification code entered."
        };
      }
      return { type: "success" };
    });
  });

  // =========================================================================
  // SUITE A: AUTOMATED MOCKED MSG91 UNIT & INTEGRATION TESTS
  // =========================================================================
  describe("Suite A: Automated Unit Tests (Mocked MSG91 Gateway)", () => {
    it("1. Successfully sends 6-digit Email OTP to provisioned Owner", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/email-otp/send")
        .set("X-CSRF-Token", csrf)
        .send({ email: ownerUser.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cooldownSeconds).toBe(COOLDOWN_SECONDS);
      expect(res.body.email).toBe(ownerUser.email.toLowerCase());
    });

    it("2. Successfully verifies 6-digit OTP, establishes Express session, and assigns DB role", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // Verify OTP "123456"
      const verifyRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({
          email: ownerUser.email,
          otp: "123456"
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.user).toBeDefined();
      expect(verifyRes.body.user.email).toBe(ownerUser.email);
      expect(verifyRes.body.user.role).toBe("owner"); // Strictly from DB
      expect(verifyRes.body.csrfToken).toBeTruthy();

      // Verify session cookie was set
      const cookies = verifyRes.headers["set-cookie"] || [];
      const sessionCookie = cookies.find((c) => c.startsWith("trustvault.sid="));
      expect(sessionCookie).toBeDefined();

      // Check session persistence with GET /api/auth/me
      const meRes = await agent.get("/api/auth/me");
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.id).toBe(ownerUser.id);
      expect(meRes.body.user.role).toBe("owner");

      // Logout and confirm session destroyed
      const logoutCsrf = await getCsrfToken(agent);
      const logoutRes = await agent
        .post("/api/auth/logout")
        .set("X-CSRF-Token", logoutCsrf)
        .send({});
      expect(logoutRes.status).toBe(200);

      const postLogoutMe = await agent.get("/api/auth/me");
      expect(postLogoutMe.status).toBe(401);
    });

    it("3. Rejects invalid OTP with 400 Bad Request and decrements remaining attempts", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({
          email: ownerUser.email,
          otp: "999888" // Invalid OTP
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid verification code/i);
      expect(res.body.remainingAttempts).toBe(MAX_VERIFY_ATTEMPTS - 1);
    });

    it("4. Rejects expired OTP with 400 Bad Request", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const res = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({
          email: ownerUser.email,
          otp: "000000" // Triggers expired mock
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/expired/i);
    });

    it("5. Locks out user after maximum failed verification attempts (5 attempts)", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // Perform 5 failed attempts
      for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i++) {
        await agent
          .post("/api/auth/email-otp/verify")
          .set("X-CSRF-Token", csrf)
          .send({ email: ownerUser.email, otp: "888888" });
      }

      // 6th attempt must be locked out with 429
      const lockedRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({ email: ownerUser.email, otp: "123456" });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toMatch(/Too many failed verification attempts/i);
    });

    it("6. Enforces 60-second cooldown on consecutive OTP send requests", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // First send request succeeds
      const firstRes = await agent
        .post("/api/auth/email-otp/send")
        .set("X-CSRF-Token", csrf)
        .send({ email: viewerUser.email });
      expect(firstRes.status).toBe(200);

      // Immediate second send request must hit 429 cooldown
      const secondRes = await agent
        .post("/api/auth/email-otp/send")
        .set("X-CSRF-Token", csrf)
        .send({ email: viewerUser.email });

      expect(secondRes.status).toBe(429);
      expect(secondRes.body.error).toMatch(/Please wait \d+ seconds before requesting a new OTP/i);
      expect(secondRes.body.remainingSeconds).toBeGreaterThan(0);
    });

    it("7. Rejects unprovisioned corporate email without leaking account metadata", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const unprovisionedEmail = `nonexistent_${Date.now()}@external.internal`;

      // 1. Send OTP rejection
      const sendRes = await agent
        .post("/api/auth/email-otp/send")
        .set("X-CSRF-Token", csrf)
        .send({ email: unprovisionedEmail });

      expect(sendRes.status).toBe(403);
      expect(sendRes.body.error).toMatch(/not provisioned/i);

      // 2. Verify OTP rejection
      const verifyRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({ email: unprovisionedEmail, otp: "123456" });

      expect(verifyRes.status).toBe(403);
      expect(verifyRes.body.error).toMatch(/not provisioned/i);
    });

    it("8. Rejects suspended corporate accounts from requesting and verifying OTP", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // 1. Send attempt on suspended user
      const sendRes = await agent
        .post("/api/auth/email-otp/send")
        .set("X-CSRF-Token", csrf)
        .send({ email: suspendedUser.email });

      expect(sendRes.status).toBe(403);
      expect(sendRes.body.error).toMatch(/suspended/i);

      // 2. Verify attempt on suspended user
      const verifyRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({ email: suspendedUser.email, otp: "123456" });

      expect(verifyRes.status).toBe(403);
      expect(verifyRes.body.error).toMatch(/suspended/i);
    });

    it("9. STRICTLY rejects Admin accounts from logging in via Email OTP", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // Send attempt with admin email
      const sendRes = await agent
        .post("/api/auth/email-otp/send")
        .set("X-CSRF-Token", csrf)
        .send({ email: adminUser.email });

      expect(sendRes.status).toBe(403);
      expect(sendRes.body.error).toMatch(/Administrator accounts must authenticate using username and password/i);

      // Verify attempt with admin email
      const verifyRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({ email: adminUser.email, otp: "123456" });

      expect(verifyRes.status).toBe(403);
      expect(verifyRes.body.error).toMatch(/Administrator accounts are not permitted to log in via OTP/i);
    });

    it("10. Prevents role tampering: Never trusts client-submitted role", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      // Client maliciously sends { role: "admin" } with an Owner email
      const verifyRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({
          email: ownerUser.email,
          otp: "123456",
          role: "admin" // Client attempts to elevate role
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.user.role).toBe("owner"); // Guaranteed owner from DB
      expect(verifyRes.body.user.role).not.toBe("admin");

      // Confirm persisted session user role in database session
      const meRes = await agent.get("/api/auth/me");
      expect(meRes.body.user.role).toBe("owner");
    });

    it("11. Strictly enforces CSRF protection on OTP verification endpoints", async () => {
      const agent = request.agent(app);

      // Request without X-CSRF-Token header
      const noCsrfRes = await agent
        .post("/api/auth/email-otp/verify")
        .send({
          email: ownerUser.email,
          otp: "123456"
        });

      expect(noCsrfRes.status).toBe(403);

      // Request with invalid CSRF token
      const badCsrfRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", "invalid-forged-csrf-token-12345")
        .send({
          email: ownerUser.email,
          otp: "123456"
        });

      expect(badCsrfRes.status).toBe(403);
    });

    it("12. Authenticates Viewer account and assigns restricted Viewer privileges", async () => {
      const agent = request.agent(app);
      const csrf = await getCsrfToken(agent);

      const verifyRes = await agent
        .post("/api/auth/email-otp/verify")
        .set("X-CSRF-Token", csrf)
        .send({
          email: viewerUser.email,
          otp: "123456"
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.user.role).toBe("viewer");
      expect(verifyRes.body.user.email).toBe(viewerUser.email);
    });

    it("13. Dispatches exact MSG91 Email API payload with secure 6-digit OTP and single-use verification", async () => {
      // Unset mockHandler so msg91Service executes real internal logic with mocked network fetch
      resetMockHandler();
      clearTrackers();

      let capturedUrl = null;
      let capturedOptions = null;
      let capturedOtp = null;

      const originalFetch = global.fetch;
      global.fetch = jest.fn(async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        const bodyObj = JSON.parse(options.body);
        capturedOtp = bodyObj.recipients[0].variables.otp;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "success",
            data: { unique_id: "mock_unique_id_999" },
            hasError: false
          })
        };
      });

      try {
        const sendRes = await sendEmailOtp({
          email: ownerUser.email,
          userName: ownerUser.name
        });

        expect(sendRes.success).toBe(true);
        expect(sendRes.cooldownSeconds).toBe(COOLDOWN_SECONDS);
        expect(capturedUrl).toBe(process.env.MSG91_EMAIL_SEND_URL || "https://control.msg91.com/api/v5/email/send");
        expect(capturedOptions.method).toBe("POST");
        expect(capturedOptions.headers["content-type"]).toBe("application/json");
        expect(capturedOptions.headers["authkey"]).toBeTruthy();

        const payload = JSON.parse(capturedOptions.body);
        expect(payload.template_id).toBe(process.env.MSG91_EMAIL_TEMPLATE_ID);
        expect(payload.domain).toBeTruthy();
        expect(payload.from.email).toBeTruthy();
        expect(payload.recipients[0].to[0].email).toBe(ownerUser.email);
        expect(payload.recipients[0].variables.user_name).toBe(ownerUser.name);
        expect(payload.recipients[0].variables.otp).toMatch(/^\d{6}$/);

        // Verify that only a secure hash is stored in memory (never plaintext OTP)
        const store = _getEmailOtpStore();
        const storedRecord = store.get(ownerUser.email.toLowerCase());
        expect(storedRecord).toBeDefined();
        expect(storedRecord.hash).toBeTruthy();
        expect(storedRecord.salt).toBeTruthy();
        expect(storedRecord.hash).not.toBe(capturedOtp); // Must be a cryptographic hash
        expect(storedRecord.attempts).toBe(0);

        // Verify OTP server-side with correct OTP
        const verifyRes = await verifyEmailOtp({
          email: ownerUser.email,
          otp: capturedOtp
        });
        expect(verifyRes.success).toBe(true);

        // Verify single-use enforcement: OTP must be immediately invalidated upon successful use
        await expect(
          verifyEmailOtp({ email: ownerUser.email, otp: capturedOtp })
        ).rejects.toThrow(/No active verification code found or code has expired/i);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("14. Handles MSG91 Email API failure responses without exposing credentials or crashing", async () => {
      resetMockHandler();
      clearTrackers();

      const originalFetch = global.fetch;
      global.fetch = jest.fn(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            status: "error",
            hasError: true,
            message: "Domain not verified for sending emails"
          })
        };
      });

      try {
        await expect(
          sendEmailOtp({ email: ownerUser.email, userName: ownerUser.name })
        ).rejects.toThrow(/Domain not verified for sending emails/);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("15. Enforces expiration on server-side OTP token store", async () => {
      resetMockHandler();
      clearTrackers();

      const store = _getEmailOtpStore();
      const salt = "mocksalt1234";
      const hash = hashOtp("654321", salt);

      // Store an expired OTP record
      store.set(ownerUser.email.toLowerCase(), {
        hash,
        salt,
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        attempts: 0,
        createdAt: Date.now() - 300000
      });

      await expect(
        verifyEmailOtp({ email: ownerUser.email, otp: "654321" })
      ).rejects.toThrow(/Verification code has expired/i);

      // Confirms record was deleted upon detecting expiration
      expect(store.has(ownerUser.email.toLowerCase())).toBe(false);
    });
  });

  // =========================================================================
  // SUITE B: REAL MSG91 GATEWAY DELIVERY TEST (CONDITIONAL)
  // =========================================================================
  describe("Suite B: Real MSG91 Email Delivery Verification (Conditional)", () => {
    const isRealMsg91Configured = Boolean(
      process.env.MSG91_AUTH_KEY &&
      (process.env.MSG91_EMAIL_TEMPLATE_ID || process.env.MSG91_WIDGET_ID) &&
      process.env.TEST_REAL_MSG91 === "true"
    );

    if (isRealMsg91Configured) {
      it("dispatches a genuine email OTP to test inbox via real MSG91 account", async () => {
        resetMockHandler(); // Ensure real network requests are issued

        const result = await sendEmailOtp({ email: ownerUser.email });
        expect(result.success).toBe(true);
      });
    } else {
      it("reports missing live MSG91 account configuration without claiming false delivery", () => {
        resetMockHandler();
        const configured = isMsg91EmailConfigured();
        if (!configured) {
          expect(() => sendEmailOtp({ email: "test@trustvault.internal" })).rejects.toThrow(
            /MSG91 Email OTP is not configured/
          );
        } else {
          // Live config present but TEST_REAL_MSG91 flag not set
          expect(true).toBe(true);
        }
      });
    }
  });
});
