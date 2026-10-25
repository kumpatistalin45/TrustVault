/**
 * TrustVault Complete End-to-End Live Integration Verification
 * Runs against live running server on http://localhost:5000
 */
const request = require("supertest");
const pool = require("../db");

const API_BASE = "http://localhost:5000";

async function runLiveVerification() {
  console.log("=== STARTING LIVE END-TO-END ROLE AUTHENTICATION VERIFICATION ===");
  const testPassword = "SecurityTestPassword2026!";

  // 1. Health check
  const healthRes = await request(API_BASE).get("/health");
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed: ${healthRes.status}`);
  }
  console.log("✔ Live server is healthy on http://localhost:5000");

  // 2. Admin Username & Password Login
  const adminAgent = request.agent(API_BASE);
  const adminCsrfRes = await adminAgent.get("/api/auth/csrf-token");
  const adminCsrf = adminCsrfRes.body.csrfToken;

  const adminLoginRes = await adminAgent
    .post("/api/auth/login")
    .set("X-CSRF-Token", adminCsrf)
    .send({
      username: "Alex Vance (Admin)",
      password: testPassword,
      role: "admin"
    });

  if (adminLoginRes.status !== 200 || adminLoginRes.body.user.role !== "admin") {
    throw new Error(`Admin login failed: ${adminLoginRes.status} ${JSON.stringify(adminLoginRes.body)}`);
  }
  console.log("✔ Admin username/password authentication succeeded. Role verified:", adminLoginRes.body.user.role);

  // 3. Admin session persistence across page refresh
  const adminMeRes = await adminAgent.get("/api/auth/me");
  if (adminMeRes.status !== 200 || adminMeRes.body.user.role !== "admin") {
    throw new Error(`Admin session persistence failed: ${adminMeRes.status}`);
  }
  console.log("✔ Admin session persistence verified (survives page refresh via /api/auth/me)");

  // 4. Admin API access (Audit logs)
  const auditRes = await adminAgent.get("/api/admin/audit-logs");
  if (auditRes.status !== 200) {
    throw new Error(`Admin audit logs failed: ${auditRes.status}`);
  }
  console.log("✔ Admin protected API access (/api/admin/audit-logs) succeeded. Found entries:", auditRes.body.total || auditRes.body.logs?.length);

  // 5. Strictly verify NO Admin Forgot Password
  const adminForgotRes = await adminAgent
    .post("/api/auth/forgot-password")
    .set("X-CSRF-Token", adminCsrf)
    .send({ email: "admin@trustvault.internal" });

  if (adminForgotRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for Admin forgot-password, got: ${adminForgotRes.status}`);
  }
  console.log("✔ Admin Forgot Password strictly rejected with 403 Forbidden");

  // 6. Owner Authentication & Document API
  const ownerAgent = request.agent(API_BASE);
  const ownerCsrfRes = await ownerAgent.get("/api/auth/csrf-token");
  const ownerCsrf = ownerCsrfRes.body.csrfToken;

  const ownerLoginRes = await ownerAgent
    .post("/api/auth/login")
    .set("X-CSRF-Token", ownerCsrf)
    .send({
      email: "jane.owner@trustvault.internal",
      password: testPassword,
      role: "owner"
    });

  if (ownerLoginRes.status !== 200 || ownerLoginRes.body.user.role !== "owner") {
    throw new Error(`Owner login failed: ${ownerLoginRes.status}`);
  }
  console.log("✔ Owner authentication succeeded. Role verified:", ownerLoginRes.body.user.role);

  const ownerDocsRes = await ownerAgent.get("/api/documents");
  if (ownerDocsRes.status !== 200) {
    throw new Error(`Owner documents list failed: ${ownerDocsRes.status}`);
  }
  console.log("✔ Owner protected document API access succeeded. Status 200, count:", ownerDocsRes.body.documents?.length);

  // 7. Verify Owner cannot access Admin APIs
  const ownerAdminAccess = await ownerAgent.get("/api/admin/audit-logs");
  if (ownerAdminAccess.status !== 403) {
    throw new Error(`Expected 403 Forbidden when Owner accesses Admin API, got: ${ownerAdminAccess.status}`);
  }
  console.log("✔ Owner correctly blocked from Admin APIs (403 Forbidden)");

  // 8. Viewer Authentication & Read Permissions
  const viewerAgent = request.agent(API_BASE);
  const viewerCsrfRes = await viewerAgent.get("/api/auth/csrf-token");
  const viewerCsrf = viewerCsrfRes.body.csrfToken;

  const viewerLoginRes = await viewerAgent
    .post("/api/auth/login")
    .set("X-CSRF-Token", viewerCsrf)
    .send({
      email: "bob.viewer@trustvault.internal",
      password: testPassword,
      role: "viewer"
    });

  if (viewerLoginRes.status !== 200 || viewerLoginRes.body.user.role !== "viewer") {
    throw new Error(`Viewer login failed: ${viewerLoginRes.status}`);
  }
  console.log("✔ Viewer authentication succeeded. Role verified:", viewerLoginRes.body.user.role);

  // 9. Viewer blocked from upload
  const viewerUploadCsrf = await viewerAgent.get("/api/auth/csrf-token");
  const viewerUploadRes = await viewerAgent
    .post("/api/documents")
    .set("X-CSRF-Token", viewerUploadCsrf.body.csrfToken)
    .attach("file", Buffer.from("%PDF-1.4 sample"), "unauthorized.pdf")
    .field("name", "Unauthorized Upload");

  if (viewerUploadRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden when Viewer uploads, got: ${viewerUploadRes.status}`);
  }
  console.log("✔ Viewer upload blocked with 403 Forbidden");

  // 10. Logout invalidation
  const logoutRes = await viewerAgent
    .post("/api/auth/logout")
    .set("X-CSRF-Token", viewerUploadCsrf.body.csrfToken);

  if (logoutRes.status !== 200) {
    throw new Error(`Logout failed: ${logoutRes.status}`);
  }

  const meAfterLogout = await viewerAgent.get("/api/auth/me");
  if (meAfterLogout.status !== 401) {
    throw new Error(`Expected 401 after logout, got: ${meAfterLogout.status}`);
  }
  console.log("✔ Logout completely invalidates session state (Subsequent /api/auth/me returns 401)");

  console.log("\n=======================================================");
  console.log("🎉 ALL LIVE INTEGRATION SCENARIOS VERIFIED SUCCESSFULLY!");
  console.log("=======================================================\n");
  await pool.end();
}

runLiveVerification().catch((err) => {
  console.error("Live verification error:", err.message);
  process.exit(1);
});
