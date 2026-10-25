/**
 * TrustVault Secure Admin Account Provisioning Script
 *
 * Usage:
 *   node provision-admin.js [name] [email] [password]
 * Or configure via environment variables:
 *   ADMIN_PROVISION_NAME="System Administrator"
 *   ADMIN_PROVISION_EMAIL="admin@trustvault.internal"
 *   ADMIN_PROVISION_PASSWORD="YourStrongPasswordHere"
 *   node provision-admin.js
 */

require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("./db");

async function provisionAdmin() {
  const name = process.argv[2] || process.env.ADMIN_PROVISION_NAME || "Alex Vance (Admin)";
  const email = process.argv[3] || process.env.ADMIN_PROVISION_EMAIL || "admin@trustvault.internal";
  const password = process.argv[4] || process.env.ADMIN_PROVISION_PASSWORD;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    console.error("Error: Valid corporate email is required for Admin account.");
    process.exit(1);
  }

  if (!password || Buffer.byteLength(password, "utf8") < 12) {
    console.error("Error: Admin password must be at least 12 characters.");
    console.error("Usage: node provision-admin.js [name] [email] [password]");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const existing = await pool.query(
      "SELECT id, role, status FROM users WHERE LOWER(email) = LOWER($1)",
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE users
         SET name = $1, password_hash = $2, role = 'admin', status = 'active', updated_at = NOW()
         WHERE LOWER(email) = LOWER($3)`,
        [trimmedName, passwordHash, normalizedEmail]
      );
      console.log(`[TrustVault] Existing user account '${normalizedEmail}' successfully updated with Administrator role and salted password hash.`);
    } else {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, status)
         VALUES ($1, $2, $3, 'admin', 'active')`,
        [trimmedName, normalizedEmail, passwordHash]
      );
      console.log(`[TrustVault] Administrator account '${normalizedEmail}' successfully provisioned with role 'admin' and active status.`);
    }

    console.log("[TrustVault] Admin account provisioning complete.");
  } catch (err) {
    console.error("[TrustVault] Admin provisioning failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

provisionAdmin().catch((err) => {
  console.error("Provisioning fatal error:", err);
  process.exit(1);
});
