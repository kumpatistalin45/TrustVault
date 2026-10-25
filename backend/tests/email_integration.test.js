const request = require("supertest");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const app = require("../server");
const pool = require("../db");
const {
  isEmailConfigured,
  validateEmailConfig,
  setTransporter,
  resetTransporter,
  sendPasswordResetEmail,
  sendComplaintNotificationEmail
} = require("../emailService");

describe("TrustVault Email Service Integration Tests", () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const defaultPassword = "EmailIntegrationPassword2026!";

  const createdUserIds = new Set();
  const createdComplaintIds = new Set();

  let adminAgent;
  let adminUserId;
  let testUserEmail;
  let testUserId;

  let mockTransporter;
  let sentMails = [];

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
    // 1. Create active Admin
    const hash = await bcrypt.hash(defaultPassword, 10);
    const adminEmail = `admin-email-${unique}@example.com`;
    const adminRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
       VALUES ('Email Admin', $1, $2, 'admin', 'active', '2026.1', NOW())
       RETURNING id`,
      [adminEmail, hash]
    );
    adminUserId = adminRes.rows[0].id;
    createdUserIds.add(adminUserId);

    adminAgent = request.agent(app);
    const loginRes = await login(adminAgent, adminEmail);
    expect(loginRes.status).toBe(200);

    // 2. Create test Viewer for reset and complaint tests
    testUserEmail = `user-email-${unique}@example.com`;
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status, terms_version, terms_accepted_at)
       VALUES ('Email Test User', $1, $2, 'viewer', 'active', '2026.1', NOW())
       RETURNING id`,
      [testUserEmail, hash]
    );
    testUserId = userRes.rows[0].id;
    createdUserIds.add(testUserId);
  });

  beforeEach(() => {
    sentMails = [];
    mockTransporter = {
      sendMail: jest.fn(async (options) => {
        sentMails.push(options);
        return { messageId: `mock-msg-${Date.now()}` };
      })
    };
    setTransporter(mockTransporter);
  });

  afterEach(() => {
    resetTransporter();
  });

  afterAll(async () => {
    try {
      if (createdComplaintIds.size > 0) {
        await pool.query(
          "DELETE FROM complaints WHERE id = ANY($1::bigint[])",
          [Array.from(createdComplaintIds)]
        );
      }
      if (createdUserIds.size > 0) {
        const uids = Array.from(createdUserIds);
        await pool.query(
          "DELETE FROM audit_logs WHERE actor_id = ANY($1::bigint[]) OR target_user_id = ANY($1::bigint[])",
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

  // 1. Email Service Configuration & Unit Tests
  describe("Email Service Configuration & Transporter Validation", () => {
    test("validateEmailConfig handles missing configuration safely without crashing", () => {
      const isConfigured = validateEmailConfig(false);
      expect(typeof isConfigured).toBe("boolean");
    });

    test("sendPasswordResetEmail throws error when no transporter is available", async () => {
      const origHost = process.env.SMTP_HOST;
      delete process.env.SMTP_HOST;
      resetTransporter();
      try {
        await expect(
          sendPasswordResetEmail({ to: "user@example.com", rawToken: "sample-token" })
        ).rejects.toThrow("Email delivery service is not configured");
      } finally {
        if (origHost !== undefined) process.env.SMTP_HOST = origHost;
      }
    });

    test("sendComplaintNotificationEmail throws error when no transporter is available", async () => {
      const origHost = process.env.SMTP_HOST;
      delete process.env.SMTP_HOST;
      resetTransporter();
      try {
        await expect(
          sendComplaintNotificationEmail({
            to: "user@example.com",
            complaint: { reference_id: "TV-CMP-TEST" },
            responseNote: "Test Note"
          })
        ).rejects.toThrow("Email delivery service is not configured");
      } finally {
        if (origHost !== undefined) process.env.SMTP_HOST = origHost;
      }
    });
  });

  // 2. Password Reset Flow with Mocked Email Transport
  describe("Password Reset Email Integration", () => {
    test("Successful password reset request sends branded email and stores hashed token in DB", async () => {
      const publicAgent = request.agent(app);
      const csrf = await getCsrfToken(publicAgent);

      const res = await publicAgent
        .post("/api/auth/forgot-password")
        .set("X-CSRF-Token", csrf)
        .send({ email: testUserEmail });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("If an account exists");

      // Verify email was dispatched via mock transport
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      expect(sentMails.length).toBe(1);

      const sent = sentMails[0];
      expect(sent.to).toBe(testUserEmail);
      expect(sent.subject).toContain("TrustVault — Secure Password Reset Request");
      expect(sent.html).toContain("reset-password?token=");
      expect(sent.text).toContain("reset-password?token=");

      // Extract rawToken from email
      const match = sent.html.match(/token=([a-f0-9]{64})/);
      expect(match).not.toBeNull();
      const rawTokenFromEmail = match[1];

      // Verify token in DB matches SHA-256 hash
      const expectedHash = crypto.createHash("sha256").update(rawTokenFromEmail).digest("hex");
      const dbTokens = await pool.query(
        "SELECT * FROM password_reset_tokens WHERE user_id = $1 AND token_hash = $2",
        [testUserId, expectedHash]
      );
      expect(dbTokens.rows.length).toBe(1);
      expect(dbTokens.rows[0].used).toBe(false);
    });

    test("Anti-enumeration: Unknown email returns neutral success response and sends zero emails", async () => {
      const publicAgent = request.agent(app);
      const csrf = await getCsrfToken(publicAgent);

      const res = await publicAgent
        .post("/api/auth/forgot-password")
        .set("X-CSRF-Token", csrf)
        .send({ email: `nonexistent-${unique}@example.com` });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("If an account exists");
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(sentMails.length).toBe(0);
    });

    test("SMTP failure handles error safely, returns HTTP 503, and does not claim success", async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(new Error("Connection timeout to SMTP gateway"));

      const publicAgent = request.agent(app);
      const csrf = await getCsrfToken(publicAgent);

      const res = await publicAgent
        .post("/api/auth/forgot-password")
        .set("X-CSRF-Token", csrf)
        .send({ email: testUserEmail });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain("Email delivery service is currently unavailable");
      // Must not leak internal SMTP credentials or error stack
      expect(res.body.error).not.toContain("Connection timeout to SMTP gateway");
    });

    test("Missing configuration causes HTTP 503 without crashing the server", async () => {
      const origHost = process.env.SMTP_HOST;
      delete process.env.SMTP_HOST;
      resetTransporter(); // removes mock transporter and unconfigured host

      try {
        const publicAgent = request.agent(app);
        const csrf = await getCsrfToken(publicAgent);

        const res = await publicAgent
          .post("/api/auth/forgot-password")
          .set("X-CSRF-Token", csrf)
          .send({ email: testUserEmail });

        expect(res.status).toBe(503);
        expect(res.body.error).toContain("Email delivery service is currently unavailable");
      } finally {
        if (origHost !== undefined) process.env.SMTP_HOST = origHost;
      }
    });
  });

  // 3. Token Expiry & Single-Use Enforcement
  describe("Password Reset Token Lifecycle", () => {
    test("Expired reset token is rejected by validate and reset endpoints", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      // Set expired timestamp (10 minutes in the past)
      const expiredAt = new Date(Date.now() - 10 * 60 * 1000);

      await pool.query(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [testUserId, tokenHash, expiredAt]
      );

      const publicAgent = request.agent(app);

      // Validate endpoint check
      const valRes = await publicAgent.get(`/api/auth/reset-password/validate?token=${rawToken}`);
      expect(valRes.status).toBe(200);
      expect(valRes.body.valid).toBe(false);
      expect(valRes.body.error).toContain("expired or has already been used");

      // Reset attempt rejected
      const csrf = await getCsrfToken(publicAgent);
      const resetRes = await publicAgent
        .post("/api/auth/reset-password")
        .set("X-CSRF-Token", csrf)
        .send({ token: rawToken, newPassword: "BrandNewSecurePassword2026!" });

      expect(resetRes.status).toBe(400);
      expect(resetRes.body.error).toContain("expired or has already been used");
    });

    test("Single-use token enforcement: token can only be used once", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const validExpiry = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [testUserId, tokenHash, validExpiry]
      );

      const publicAgent = request.agent(app);
      const csrf = await getCsrfToken(publicAgent);
      const updatedPassword = "UpdatedSingleUsePass2026!";

      // First reset: succeeds
      const firstRes = await publicAgent
        .post("/api/auth/reset-password")
        .set("X-CSRF-Token", csrf)
        .send({ token: rawToken, newPassword: updatedPassword });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.message).toContain("Password updated successfully");

      // Second reset with same token: rejected
      const secondRes = await publicAgent
        .post("/api/auth/reset-password")
        .set("X-CSRF-Token", csrf)
        .send({ token: rawToken, newPassword: "AnotherPasswordAttempt2026!" });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error).toContain("expired or has already been used");

      // Login with new password succeeds
      const loginAgent = request.agent(app);
      const loginRes = await login(loginAgent, testUserEmail, updatedPassword);
      expect(loginRes.status).toBe(200);
    });
  });

  // 4. Complaint Email Notifications
  describe("Admin Complaint Email Notifications", () => {
    let complaintId;
    let complaintRef;

    beforeEach(async () => {
      const ref = `TV-CMP-NOTIF-${Math.floor(10000 + Math.random() * 90000)}`;
      const res = await pool.query(
        `INSERT INTO complaints (reference_id, user_id, category, subject, description, status, priority)
         VALUES ($1, $2, 'Security', 'Permission Anomaly', 'Audit investigation needed', 'Submitted', 'Medium')
         RETURNING id, reference_id`,
        [ref, testUserId]
      );
      complaintId = res.rows[0].id;
      complaintRef = res.rows[0].reference_id;
      createdComplaintIds.add(complaintId);
    });

    test("Dispatches notification email when admin explicitly sets emailNotified: true", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const updateRes = await adminAgent
        .patch(`/api/admin/complaints/${complaintId}`)
        .set("X-CSRF-Token", csrf)
        .send({
          status: "in_review",
          priority: "high",
          responseNote: "We have initiated a forensic review of the permission audit trail.",
          emailNotified: true
        });

      expect(updateRes.status).toBe(200);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);

      const sent = sentMails[0];
      expect(sent.to).toBe(testUserEmail);
      expect(sent.subject).toContain(complaintRef);
      expect(sent.html).toContain("forensic review");

      // Verify timeline recorded emailDispatched = true
      const dbRes = await pool.query("SELECT timeline FROM complaints WHERE id = $1", [complaintId]);
      const timeline = dbRes.rows[0].timeline;
      expect(timeline[timeline.length - 1].emailDispatched).toBe(true);
    });

    test("Does NOT dispatch email when emailNotified is false or omitted", async () => {
      const csrf = await getCsrfToken(adminAgent);
      const updateRes = await adminAgent
        .patch(`/api/admin/complaints/${complaintId}`)
        .set("X-CSRF-Token", csrf)
        .send({
          status: "resolved",
          responseNote: "Internal resolution note for admin records.",
          emailNotified: false
        });

      expect(updateRes.status).toBe(200);
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(sentMails.length).toBe(0);

      const dbRes = await pool.query("SELECT timeline FROM complaints WHERE id = $1", [complaintId]);
      const timeline = dbRes.rows[0].timeline;
      expect(timeline[timeline.length - 1].emailDispatched).toBe(false);
    });

    test("When email delivery fails, records emailDispatched: false and does not claim delivery", async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(new Error("SMTP socket closed unexpectedly"));

      const csrf = await getCsrfToken(adminAgent);
      const updateRes = await adminAgent
        .patch(`/api/admin/complaints/${complaintId}`)
        .set("X-CSRF-Token", csrf)
        .send({
          status: "in_review",
          responseNote: "Status updated while mail server was unreachable.",
          emailNotified: true
        });

      expect(updateRes.status).toBe(200);

      // Complaint was still updated, but timeline truthfully reflects that email failed
      const dbRes = await pool.query("SELECT timeline FROM complaints WHERE id = $1", [complaintId]);
      const timeline = dbRes.rows[0].timeline;
      expect(timeline[timeline.length - 1].emailDispatched).toBe(false);
    });
  });
});
