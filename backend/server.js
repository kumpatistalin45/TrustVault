const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { doubleCsrf } = require("csrf-csrf");
const multer = require("multer");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");

const { encryptBuffer, decryptBuffer } = require("./encryption");
const {
  getMasterKek,
  generateKeyBytes,
  generateKeyId,
  wrapKey,
  unwrapKey,
  encryptDocumentWithDek,
  decryptDocumentWithDek,
  createTVE2Envelope,
  parseEnvelope,
  getActiveManagedKey,
  getManagedKeyBytes,
  createManagedKey,
  rotateManagedKey,
  revokeManagedKey
} = require("./keyManagementService");
const {
  saveEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  storagePathForKey,
  STORAGE_DIR,
  validateStorageConfig
} = require("./storageService");
const {
  sendPasswordResetEmail,
  sendComplaintNotificationEmail,
  sendSignInLinkEmail,
  validateEmailConfig,
  verifySmtpConnection,
  isEmailConfigured
} = require("./emailService");
const {
  sendOtp,
  verifyOtp,
  retryOtp,
  normalizePhoneNumber,
  isMsg91Configured,
  sendEmailOtp,
  verifyEmailOtp,
  retryEmailOtp,
  normalizeEmail,
  isMsg91EmailConfigured,
  getMsg91EmailConfigurationStatus
} = require("./msg91Service");
const {
  isValidEmail,
  isValidPhone,
  sanitizeFormulaInjection,
  parseCsv,
  normalizeRowAliases,
  generateUniqueId
} = require("./masterDataService");
const {
  isFirebaseConfigured,
  initFirebaseAdmin,
  verifyFirebaseIdToken,
  generateFirebaseSignInLink,
  generateSecureToken,
  hashToken
} = require("./firebaseService");
const pool = require("./db");

// Safe Idempotent Schema Migrations Execution on Boot
for (const migFile of ["001_safe_schema_expansion.sql", "002_master_data_management.sql", "003_secure_key_management.sql", "004_email_link_auth.sql"]) {
  try {
    const migrationPath = path.resolve(__dirname, "migrations", migFile);
    if (fs.existsSync(migrationPath)) {
      const migrationSql = fs.readFileSync(migrationPath, "utf8");
      pool.query(migrationSql).catch(() => {});
    }
  } catch (_migErr) {}
}

// Background self-destruct cleanup worker (runs every 60s)
const autoDeleteInterval = setInterval(async () => {
  try {
    const expiredResult = await pool.query(`
      SELECT id, storage_key FROM documents
      WHERE timer_enabled = TRUE
        AND auto_delete = TRUE
        AND unlocked_at IS NOT NULL
        AND (unlocked_at + (timer_duration_minutes || ' minutes')::INTERVAL) < NOW()
    `);
    for (const doc of expiredResult.rows) {
      await pool.query("DELETE FROM document_permissions WHERE document_id = $1", [doc.id]);
      await pool.query("DELETE FROM documents WHERE id = $1", [doc.id]);
      await deleteEncryptedFile(doc.storage_key);
      writeAudit({
        actorId: null,
        action: "document_delete",
        documentId: doc.id,
        outcome: "success",
        details: { reason: "Auto-delete timer elapsed via background worker" }
      }).catch(() => {});
    }
  } catch (_e) {}
}, 60000);
if (autoDeleteInterval.unref) autoDeleteInterval.unref();


const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const frontendOrigin = allowedOrigins[0] || "http://localhost:5173";
const cookieSameSite = process.env.COOKIE_SAMESITE || (isProduction && process.env.CROSS_ORIGIN_COOKIES === "true" ? "none" : "lax");

validateEmailConfig(isProduction);
if (process.env.NODE_ENV !== "test" && isEmailConfigured()) {
  verifySmtpConnection()
    .then((result) => {
      if (result.success) {
        console.log(`[EMAIL_DIAGNOSTIC] SMTP connection verified successfully: host=${process.env.SMTP_HOST}, port=${process.env.SMTP_PORT || 587}`);
      } else {
        console.warn(`[EMAIL_DIAGNOSTIC] SMTP verification warning: category=${result.category}, code=${result.code}, error=${result.error}`);
      }
    })
    .catch((err) => {
      console.warn(`[EMAIL_DIAGNOSTIC] SMTP verification error: ${err.message}`);
    });
}
validateStorageConfig(isProduction);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_PERMISSIONS = new Set(["read", "edit"]);
const ALLOWED_AUDIT_OUTCOMES = new Set(["success", "denied", "failure"]);

// --------------------------------------------------
// Environment validation
// --------------------------------------------------

for (const key of ["SESSION_SECRET", "CSRF_SECRET"]) {
  if (
    typeof process.env[key] !== "string" ||
    Buffer.byteLength(process.env[key], "utf8") < 32
  ) {
    throw new Error(`${key} must contain at least 32 bytes.`);
  }
}

if (!/^[a-fA-F0-9]{64}$/.test(process.env.FILE_ENCRYPTION_KEY || "")) {
  throw new Error(
    "FILE_ENCRYPTION_KEY must be a 32-byte hexadecimal key."
  );
}

if (isProduction && !process.env.FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN must be configured in production.");
}

// --------------------------------------------------
// Private encrypted storage
// --------------------------------------------------

fs.mkdirSync(STORAGE_DIR, {
  recursive: true,
  mode: 0o700
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 10,
    fieldSize: 16 * 1024,
    parts: 12
  }
});

const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

function sanitizeFilename(filename) {
  const cleaned = path
    .basename(String(filename || "").replace(/[\\/]/g, "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (cleaned === "." || cleaned === "..") {
    return "";
  }
  return cleaned;
}

function detectMimeType(buffer, fallbackMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return "application/octet-stream";
  }

  // Magic byte checks for common document types
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    if (
      typeof fallbackMime === "string" &&
      /^(application\/(vnd\.openxmlformats|zip))/.test(fallbackMime)
    ) {
      return fallbackMime.slice(0, 150);
    }
    return "application/zip";
  }

  if (
    typeof fallbackMime === "string" &&
    /^[a-zA-Z0-9][-a-zA-Z0-9+.]*\/[a-zA-Z0-9][-a-zA-Z0-9+.]*$/.test(
      fallbackMime.trim()
    )
  ) {
    return fallbackMime.trim().slice(0, 150).toLowerCase();
  }

  return "application/octet-stream";
}

function isValidCalendarDate(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
    return false;
  }
  const parts = str.trim().split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function escapeLike(str) {
  return String(str || "").replace(/[%_\\]/g, "\\$&");
}

async function removeStoredFile(key) {
  return deleteEncryptedFile(key);
}


// Format: magic (4 bytes) | IV (12 bytes) | auth tag (16 bytes) | ciphertext

function createEncryptedEnvelope(plaintext) {
  const encrypted = encryptBuffer(plaintext);

  return Buffer.concat([
    Buffer.from("TVE1", "ascii"),
    Buffer.from(encrypted.iv, "hex"),
    Buffer.from(encrypted.authTag, "hex"),
    encrypted.ciphertext
  ]);
}

function decryptEnvelope(envelope, dek = null) {
  if (!Buffer.isBuffer(envelope) || envelope.length < 32) {
    throw new Error("Invalid encrypted file format");
  }

  const magic = envelope.subarray(0, 4).toString("ascii");

  if (magic === "TVE1") {
    return decryptBuffer({
      version: 1,
      iv: envelope.subarray(4, 16).toString("hex"),
      authTag: envelope.subarray(16, 32).toString("hex"),
      ciphertext: envelope.subarray(32)
    });
  }

  if (magic === "TVE2") {
    const ivHex = envelope.subarray(4, 16).toString("hex");
    const authTagHex = envelope.subarray(16, 32).toString("hex");
    const ciphertext = envelope.subarray(32);
    if (!dek) {
      throw new Error("DEK required to decrypt TVE2 envelope");
    }
    return decryptDocumentWithDek(ciphertext, ivHex, authTagHex, dek);
  }

  throw new Error("Invalid encrypted file format");
}

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // Allow local development and LAN origins (e.g., mobile testing on 10.x.x.x, 192.168.x.x)
      if (!isProduction) {
        try {
          const parsed = new URL(origin);
          const host = parsed.hostname;
          if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
          ) {
            return callback(null, true);
          }
        } catch (_err) {}
      }

      return callback(new Error("Origin not allowed"));
    },
    credentials: true,
    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"]
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(cookieParser());

app.use(
  session({
    name: "trustvault.sid",
    store: new pgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: cookieSameSite,
      maxAge: 15 * 60 * 1000,
      path: "/"
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_LOGIN || 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Try again later."
  }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_REGISTRATION || 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many registration attempts. Try again later."
  }
});

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_UNLOCK || 20),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many unlock attempts. Try again later."
  }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD || 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many password reset requests. Try again later."
  }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_OTP || 15),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many OTP requests from this IP address. Please try again later."
  }
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_OTP_VERIFY || 25),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many OTP verification attempts from this IP address. Please try again later."
  }
});

// Email-link passwordless auth rate limiters
const emailLinkSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 1000 : Number(process.env.RATE_LIMIT_EMAIL_LINK || 5),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many sign-in link requests from this IP address. Please try again later."
  }
});

const emailLinkCompleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "test" ? 1000 : Number(process.env.RATE_LIMIT_EMAIL_LINK_COMPLETE || 15),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many authentication completion attempts from this IP address. Please try again later."
  }
});

// Per-account email-link cooldown constants
const EMAIL_LINK_COOLDOWN_SECONDS = Number(process.env.EMAIL_LINK_COOLDOWN_SECONDS || 60);
const EMAIL_LINK_EXPIRY_MINUTES = 10;
const EMAIL_LINK_MAX_PER_WINDOW = Number(process.env.EMAIL_LINK_MAX_PER_WINDOW || 8); // max sends per 1h window per email
const EMAIL_LINK_WINDOW_HOURS = 1;

// --------------------------------------------------
// CSRF protection
// IMPORTANT: Token route must come before protection.
// --------------------------------------------------

const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  getSessionIdentifier: (req) => req.sessionID,
  cookieName: "trustvault.csrf",
  cookieOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: cookieSameSite,
    path: "/"
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"]
});

app.get("/api/auth/csrf-token", (req, res, next) => {
  req.session.csrfInitialized = true;

  req.session.save((saveError) => {
    if (saveError) {
      return next(saveError);
    }

    try {
      const csrfToken = generateCsrfToken(req, res);
      return res.status(200).json({ csrfToken });
    } catch (error) {
      return next(error);
    }
  });
});

app.use(doubleCsrfProtection);

// --------------------------------------------------
// Validation helpers
// --------------------------------------------------

function validEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function validDocumentId(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

function validUserId(value) {
  return validDocumentId(value);
}

async function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  try {
    const userRes = await pool.query(
      "SELECT id, role, status FROM users WHERE id = $1 LIMIT 1",
      [req.session.user.id]
    );

    if (!userRes.rows[0]) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Authentication required" });
    }

    const { role, status } = userRes.rows[0];
    if (status === "inactive" || status === "suspended" || status === "rejected") {
      req.session.destroy(() => {});
      return res.status(403).json({
        error: "Account is inactive or suspended. Contact an administrator."
      });
    }

    req.session.user.role = role;
    req.session.user.status = status;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireOwner(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT id, role, status FROM users WHERE id = $1 LIMIT 1",
      [req.session.user.id]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { role, status } = result.rows[0];
    if (status === "inactive" || status === "suspended" || status === "rejected") {
      return res.status(403).json({ error: "Account is inactive or suspended" });
    }

    if (role !== "owner" && role !== "admin") {
      await writeAudit({
        actorId: req.session.user.id,
        action: "viewer_master_data_access",
        outcome: "denied",
        details: { reason: "Document Owner access required" }
      });
      return res.status(403).json({ error: "Document Owner access required" });
    }

    req.session.user.role = role;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT role FROM users WHERE id = $1 LIMIT 1",
      [req.session.user.id]
    );

    if (!result.rows[0]) {
      return res.status(401).json({
        error: "Authentication required"
      });
    }

    if (result.rows[0].role !== "admin") {
      await writeAudit({
        actorId: req.session.user.id,
        action: "admin_audit_logs_read",
        outcome: "denied",
        details: { reason: "Admin access required" }
      });

      return res.status(403).json({
        error: "Admin access required"
      });
    }

    req.session.user.role = result.rows[0].role;

    return next();
  } catch (error) {
    return next(error);
  }
}

// --------------------------------------------------
// Audit logging
// --------------------------------------------------

async function writeAudit({
  actorId,
  action,
  documentId = null,
  targetUserId = null,
  outcome,
  details = {},
  db = pool
}) {
  await db.query(
    `INSERT INTO audit_logs
       (actor_id, action, document_id, target_user_id, outcome, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actorId || null,
      action,
      documentId || null,
      targetUserId || null,
      outcome,
      JSON.stringify(details)
    ]
  );
}

// --------------------------------------------------
// Document access helper
// --------------------------------------------------

async function findAccessibleDocument(documentId, userId) {
  // Check and execute auto-delete for expired documents if timer has elapsed
  try {
    await pool.query(
      `DELETE FROM documents
       WHERE id = $1
         AND timer_enabled = TRUE
         AND auto_delete = TRUE
         AND unlocked_at IS NOT NULL
         AND (unlocked_at + (timer_duration_minutes || ' minutes')::INTERVAL) < NOW()`,
      [documentId]
    );
  } catch (_e) {}

  const result = await pool.query(
    `SELECT d.id, d.owner_id, d.name, d.category, d.mime_type,
            d.size_bytes, d.created_at, d.updated_at,
            d.timer_enabled, d.timer_duration_minutes, d.auto_delete, d.unlocked_at,
            d.secret_key_hash,
            CASE
              WHEN d.owner_id = $2 THEN 'owner'
              ELSE dp.permission
            END AS access_level
     FROM documents d
     LEFT JOIN document_permissions dp
       ON dp.document_id = d.id AND dp.user_id = $2
     WHERE d.id = $1
       AND (d.owner_id = $2 OR dp.user_id IS NOT NULL)
     LIMIT 1`,
    [documentId, userId]
  );

  return result.rows[0] || null;
}

// --------------------------------------------------
// Health checks
// --------------------------------------------------

app.get("/health", (_req, res) => {
  return res.json({ status: "ok" });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.json({
      status: "ok",
      database: "connected"
    });
  } catch (_error) {
    return res.status(503).json({
      status: "error",
      database: "unavailable"
    });
  }
});

// --------------------------------------------------
// Registration
// --------------------------------------------------

app.post(
  "/api/auth/register",
  registrationLimiter,
  async (req, res, next) => {
    try {
      const { name, email, password, role, mobile, termsAccepted, termsVersion } = req.body || {};

      const isPublicSignupDisabled =
        process.env.DISABLE_PUBLIC_SIGNUP === "true" ||
        process.env.ALLOW_PUBLIC_SIGNUP === "false" ||
        (isProduction && process.env.ALLOW_PUBLIC_SIGNUP !== "true");

      if (isPublicSignupDisabled) {
        await writeAudit({
          actorId: null,
          action: "auth_register",
          outcome: "denied",
          details: { reason: "Public registration is disabled" }
        });
        return res.status(403).json({
          error: "Public registration is disabled. Users must be provisioned by an administrator or document owner."
        });
      }

      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 100
      ) {
        return res.status(400).json({
          error: "Valid name is required"
        });
      }

      if (!validEmail(email)) {
        return res.status(400).json({
          error: "Valid email is required"
        });
      }

      if (
        typeof password !== "string" ||
        Buffer.byteLength(password, "utf8") < 12 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        return res.status(400).json({
          error: "Password must be between 12 and 72 UTF-8 bytes"
        });
      }

      if (typeof role === "string" && role.trim().toLowerCase() === "admin") {
        await writeAudit({
          actorId: null,
          action: "auth_register",
          outcome: "denied",
          details: { reason: "Public admin registration prohibited" }
        });
        return res.status(403).json({
          error: "Admin accounts cannot be created via public registration. Contact an authorized system administrator."
        });
      }

      const assignedRole =
        typeof role === "string" && role.trim().toLowerCase() === "viewer"
          ? "viewer"
          : "owner";

      // Owner accounts created via public registration require Admin approval.
      const assignedStatus = assignedRole === "owner" ? "pending" : "active";
      const mobileNum =
        typeof mobile === "string" && mobile.trim()
          ? mobile.trim().slice(0, 25)
          : null;

      const passwordHash = await bcrypt.hash(password, 12);

      try {
        const result = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, status, mobile, terms_accepted_at, terms_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, name, email, role, status, mobile, created_at`,
          [
            name.trim(),
            email.trim().toLowerCase(),
            passwordHash,
            assignedRole,
            assignedStatus,
            mobileNum,
            termsAccepted ? new Date() : null,
            termsVersion || (termsAccepted ? "2026.1" : null)
          ]
        );

        const newUser = result.rows[0];

        await writeAudit({
          actorId: newUser.id,
          action: "auth_register",
          outcome: "success",
          details: { role: newUser.role, status: newUser.status }
        });

        return res.status(201).json({
          user: newUser
        });
      } catch (error) {
        if (error.code === "23505") {
          await writeAudit({
            actorId: null,
            action: "auth_register",
            outcome: "failure",
            details: { reason: "Duplicate email registration attempt" }
          });

          return res.status(409).json({
            error: "An account with this email already exists"
          });
        }

        throw error;
      }
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// Login
// --------------------------------------------------

const dummyHashPromise = bcrypt.hash(
  "TrustVault-dummy-password-not-for-login",
  12
);

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  try {
    const identifier = String(req.body?.username || req.body?.email || "").trim();
    const password = req.body?.password;
    const requestedRole = req.body?.role ? String(req.body.role).trim().toLowerCase() : null;

    if (
      !identifier ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Username/email and password are required"
      });
    }

    if (
      identifier.length > 255 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        error: "Invalid username or password"
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role, status, mobile, avatar_url, terms_version, terms_accepted_at
       FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1) OR unique_id = $1
       LIMIT 1`,
      [identifier]
    );

    const user = result.rows[0];
    const hash = user
      ? user.password_hash
      : await dummyHashPromise;

    const matches = await bcrypt.compare(password, hash);

    const isUsernameLogin = Boolean(req.body?.username && !req.body?.email);

    if (!user || !matches) {
      await writeAudit({
        actorId: user ? user.id : null,
        action: "auth_login",
        outcome: "failure",
        details: { reason: "Invalid credentials" }
      });

      return res.status(401).json({
        error: isUsernameLogin ? "Invalid username or password" : "Invalid email or password"
      });
    }

    // Role check: If login was explicitly attempted as admin, ensure the user actually is an admin
    if (requestedRole === "admin" && user.role !== "admin") {
      await writeAudit({
        actorId: user.id,
        action: "auth_login",
        outcome: "denied",
        details: { reason: "Non-admin attempted admin login", attemptedRole: requestedRole, actualRole: user.role }
      });

      return res.status(403).json({
        error: "Administrator access required. This account does not possess administrator privileges."
      });
    }

    if (user.status === "inactive" || user.status === "suspended" || user.status === "rejected") {
      await writeAudit({
        actorId: user.id,
        action: "auth_login",
        outcome: "denied",
        details: { reason: `Account is ${user.status}` }
      });

      return res.status(403).json({
        error: `Account is ${user.status}. Contact an authorized administrator.`
      });
    }

    // Single active session enforcement: Revoke existing active sessions for this user ID
    try {
      await pool.query(
        `DELETE FROM user_sessions
         WHERE sess->'user'->>'id' = $1::text`,
        [String(user.id)]
      );
    } catch (_sessErr) {}

    pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]).catch(() => {});

    req.session.regenerate((error) => {
      if (error) return next(error);

      // Session role is ALWAYS set from database record (Requirement 2.9, 3.9, 4.7)
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || "active",
        avatar_url: user.avatar_url || null
      };

      req.session.save(async (saveError) => {
        if (saveError) return next(saveError);

        await writeAudit({
          actorId: user.id,
          action: "auth_login",
          outcome: "success",
          details: { role: user.role, status: user.status }
        });

        let csrfToken;
        try {
          csrfToken = generateCsrfToken(req, res);
        } catch (_csrfError) {
          // Fallback if token generation fails
        }

        return res.json({
          user: req.session.user,
          ...(csrfToken ? { csrfToken } : {})
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Firebase Token Verification Login (Owner / Viewer)
// --------------------------------------------------

app.post("/api/auth/firebase-login", loginLimiter, async (req, res, next) => {
  try {
    const { idToken, role: requestedRole } = req.body || {};

    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({
        error: "Firebase ID token is required"
      });
    }

    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(idToken.trim());
    } catch (verErr) {
      await writeAudit({
        actorId: null,
        action: "auth_firebase_login",
        outcome: "failure",
        details: { reason: verErr.message || "Invalid Firebase ID token" }
      });

      return res.status(401).json({
        error: verErr.message || "Invalid or expired Firebase ID token"
      });
    }

    const verifiedEmail = decodedToken?.email;
    if (!verifiedEmail || !validEmail(verifiedEmail)) {
      await writeAudit({
        actorId: null,
        action: "auth_firebase_login",
        outcome: "failure",
        details: { reason: "Token missing verified email address" }
      });

      return res.status(400).json({
        error: "Firebase ID token does not contain a verified email address"
      });
    }

    // Look up user in PostgreSQL master data
    const userRes = await pool.query(
      `SELECT id, name, email, password_hash, role, status, mobile, avatar_url, terms_version, terms_accepted_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [verifiedEmail.trim().toLowerCase()]
    );

    const user = userRes.rows[0];

    if (!user) {
      await writeAudit({
        actorId: null,
        action: "auth_firebase_login",
        outcome: "denied",
        details: { email: verifiedEmail, reason: "Unprovisioned account" }
      });

      return res.status(403).json({
        error: "This corporate email address is not provisioned in TrustVault. Please contact your organization administrator."
      });
    }

    // Reject Admin accounts attempting Firebase OTP login per Requirement 2.3
    if (user.role === "admin") {
      await writeAudit({
        actorId: user.id,
        action: "auth_firebase_login",
        outcome: "denied",
        details: { reason: "Admin accounts must authenticate using username and password" }
      });

      return res.status(403).json({
        error: "Administrator accounts must authenticate using username and password."
      });
    }

    // Reject inactive, suspended, or rejected accounts
    if (user.status === "inactive" || user.status === "suspended" || user.status === "rejected") {
      await writeAudit({
        actorId: user.id,
        action: "auth_firebase_login",
        outcome: "denied",
        details: { reason: `Account is ${user.status}` }
      });

      return res.status(403).json({
        error: `Account is ${user.status}. Contact an authorized administrator.`
      });
    }

    // Single active session enforcement: Revoke existing active sessions for this user ID
    try {
      await pool.query(
        `DELETE FROM user_sessions
         WHERE sess->'user'->>'id' = $1::text`,
        [String(user.id)]
      );
    } catch (_sessErr) {}

    pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]).catch(() => {});

    req.session.regenerate((error) => {
      if (error) return next(error);

      // Session role is STRICTLY assigned from PostgreSQL record! (Never trust requestedRole)
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || "active",
        avatar_url: user.avatar_url || null
      };

      req.session.save(async (saveError) => {
        if (saveError) return next(saveError);

        await writeAudit({
          actorId: user.id,
          action: "auth_firebase_login",
          outcome: "success",
          details: { role: user.role, status: user.status, attemptedRole: requestedRole || user.role }
        });

        let csrfToken;
        try {
          csrfToken = generateCsrfToken(req, res);
        } catch (_csrfError) {
          // Fallback if token generation fails
        }

        return res.json({
          success: true,
          user: req.session.user,
          ...(csrfToken ? { csrfToken } : {})
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Current user
// --------------------------------------------------

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, status, mobile, avatar_url, terms_version, terms_accepted_at, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.session.user.id]
    );

    if (!result.rows[0]) {
      return res.status(401).json({
        error: "Authentication required"
      });
    }

    req.session.user = {
      ...req.session.user,
      id: result.rows[0].id,
      name: result.rows[0].name,
      email: result.rows[0].email,
      role: result.rows[0].role,
      status: result.rows[0].status || "active",
      avatar_url: result.rows[0].avatar_url || null
    };

    return res.json({
      user: result.rows[0]
    });
  } catch (error) {
    return next(error);
  }
});

// Update Profile (Current user)
app.patch("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { name, mobile, avatar_url } = req.body || {};

    let sanitizedName = null;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ error: "Name must be a valid non-empty string up to 100 characters" });
      }
      sanitizedName = sanitizeFormulaInjection(name.trim().slice(0, 100));
    }

    let sanitizedMobile = null;
    if (mobile !== undefined) {
      if (mobile && !isValidPhone(mobile)) {
        return res.status(400).json({ error: "Invalid mobile phone number format" });
      }
      sanitizedMobile = mobile ? sanitizeFormulaInjection(String(mobile).trim().slice(0, 25)) : null;
    }

    let sanitizedAvatar = null;
    if (avatar_url !== undefined) {
      if (avatar_url && typeof avatar_url === "string" && avatar_url.length <= 500000) {
        sanitizedAvatar = avatar_url.trim();
      } else if (avatar_url === null || avatar_url === "") {
        sanitizedAvatar = null;
      } else {
        return res.status(400).json({ error: "Invalid avatar data" });
      }
    }

    const result = await pool.query(`
      UPDATE users
      SET name = COALESCE($1, name),
          mobile = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE mobile END,
          avatar_url = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE avatar_url END,
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, name, email, role, status, mobile, avatar_url, terms_version, terms_accepted_at, created_at, updated_at
    `, [sanitizedName, sanitizedMobile, sanitizedAvatar, userId]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    const updated = result.rows[0];
    if (req.session?.user) {
      req.session.user.name = updated.name;
      req.session.user.avatar_url = updated.avatar_url;
    }

    await writeAudit({
      actorId: userId,
      action: "user_profile_update",
      targetUserId: userId,
      outcome: "success",
      details: { updatedFields: Object.keys(req.body) }
    });

    return res.json({
      success: true,
      user: updated
    });
  } catch (error) {
    return next(error);
  }
});

// Change Password (Current user)
app.post("/api/auth/change-password", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { currentPassword, newPassword } = req.body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (
      Buffer.byteLength(newPassword, "utf8") < 12 ||
      Buffer.byteLength(newPassword, "utf8") > 72
    ) {
      return res.status(400).json({ error: "New password must be between 12 and 72 UTF-8 bytes" });
    }

    const userResult = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (!userResult.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    const matches = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!matches) {
      await writeAudit({
        actorId: userId,
        action: "user_password_change",
        outcome: "failure",
        details: { reason: "Incorrect current password" }
      });
      return res.status(401).json({ error: "Incorrect current password" });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [newHash, userId]
    );

    await writeAudit({
      actorId: userId,
      action: "user_password_change",
      targetUserId: userId,
      outcome: "success",
      details: {}
    });

    return res.json({
      success: true,
      message: "Password updated successfully"
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Logout
// --------------------------------------------------

app.post("/api/auth/logout", requireAuth, async (req, res, next) => {
  const actorId = req.session.user.id;

  await writeAudit({
    actorId,
    action: "auth_logout",
    outcome: "success"
  });

  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("trustvault.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/"
    });

    res.clearCookie("trustvault.csrf", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/"
    });

    return res.json({
      message: "Logged out successfully"
    });
  });
});

// --------------------------------------------------
// Mobile Phone OTP Verification APIs (MSG91 v5)
// --------------------------------------------------

// 1. Request / Send 6-digit Mobile OTP
app.post("/api/auth/otp/send", otpLimiter, async (req, res, next) => {
  try {
    const actorId = req.session?.user?.id;
    let targetMobile = req.body?.mobile;

    if (!targetMobile && actorId) {
      targetMobile = req.session.user.mobile;
    }

    if (!targetMobile || typeof targetMobile !== "string") {
      return res.status(400).json({ error: "Mobile phone number is required." });
    }

    let normalized;
    try {
      normalized = normalizePhoneNumber(targetMobile);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    try {
      const dispatchResult = await sendOtp({ mobile: normalized });

      if (actorId) {
        await writeAudit({
          actorId,
          action: "otp_send",
          outcome: "success",
          details: { mobileMasked: normalized.slice(0, 2) + "****" + normalized.slice(-3) }
        });
      }

      return res.json({
        success: true,
        message: "Verification code sent successfully.",
        cooldownSeconds: dispatchResult.cooldownSeconds || 60,
        normalizedMobile: normalized
      });
    } catch (otpErr) {
      if (otpErr.code === "COOLDOWN") {
        return res.status(429).json({
          error: otpErr.message,
          remainingSeconds: otpErr.remainingSeconds
        });
      }
      if (otpErr.code === "RATE_LIMIT_EXCEEDED") {
        return res.status(429).json({ error: otpErr.message });
      }

      if (actorId) {
        await writeAudit({
          actorId,
          action: "otp_send",
          outcome: "failure",
          details: { reason: "SMS delivery failure" }
        });
      }

      return res.status(503).json({
        error: "SMS OTP delivery service is currently unavailable. Please try again later."
      });
    }
  } catch (error) {
    return next(error);
  }
});

// 2. Verify 6-digit Mobile OTP
app.post("/api/auth/otp/verify", otpVerifyLimiter, async (req, res, next) => {
  try {
    const actorId = req.session?.user?.id;
    const { mobile, otp } = req.body || {};

    let targetMobile = mobile;
    if (!targetMobile && actorId) {
      targetMobile = req.session.user.mobile;
    }

    if (!targetMobile || typeof targetMobile !== "string") {
      return res.status(400).json({ error: "Mobile phone number is required." });
    }

    if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
      return res.status(400).json({ error: "Verification code must be exactly 6 numeric digits." });
    }

    let normalized;
    try {
      normalized = normalizePhoneNumber(targetMobile);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    try {
      await verifyOtp({ mobile: normalized, otp: otp.trim() });

      if (actorId) {
        const updateRes = await pool.query(`
          UPDATE users
          SET mobile = $1, phone_verified = TRUE, phone_verified_at = NOW()
          WHERE id = $2
          RETURNING id, name, email, role, status, mobile, phone_verified, phone_verified_at
        `, [normalized, actorId]);

        const updatedUser = updateRes.rows[0];
        req.session.user = {
          ...req.session.user,
          mobile: updatedUser.mobile,
          phone_verified: true
        };

        await writeAudit({
          actorId,
          action: "phone_verification",
          outcome: "success",
          details: { mobileMasked: normalized.slice(0, 2) + "****" + normalized.slice(-3) }
        });

        return res.json({
          success: true,
          verified: true,
          phone_verified: true,
          message: "Mobile phone number successfully verified.",
          user: updatedUser
        });
      }

      return res.json({
        success: true,
        verified: true,
        phone_verified: true,
        mobile: normalized,
        message: "Mobile phone number successfully verified."
      });
    } catch (verErr) {
      if (actorId) {
        await writeAudit({
          actorId,
          action: "phone_verification",
          outcome: "denied",
          details: { reason: verErr.message }
        });
      }

      if (verErr.code === "MAX_ATTEMPTS_EXCEEDED") {
        return res.status(429).json({ error: verErr.message });
      }

      return res.status(400).json({
        error: verErr.message || "Invalid or expired verification code.",
        remainingAttempts: verErr.remainingAttempts
      });
    }
  } catch (error) {
    return next(error);
  }
});

// 3. Retry / Resend 6-digit Mobile OTP
app.post("/api/auth/otp/retry", otpLimiter, async (req, res, next) => {
  try {
    const actorId = req.session?.user?.id;
    const { mobile, retryType } = req.body || {};

    let targetMobile = mobile;
    if (!targetMobile && actorId) {
      targetMobile = req.session.user.mobile;
    }

    if (!targetMobile || typeof targetMobile !== "string") {
      return res.status(400).json({ error: "Mobile phone number is required." });
    }

    let normalized;
    try {
      normalized = normalizePhoneNumber(targetMobile);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    try {
      const retryResult = await retryOtp({ mobile: normalized, retryType });
      return res.json({
        success: true,
        message: retryResult.message || "Verification code resent successfully.",
        cooldownSeconds: retryResult.cooldownSeconds || 60
      });
    } catch (err) {
      if (err.code === "COOLDOWN") {
        return res.status(429).json({
          error: err.message,
          remainingSeconds: err.remainingSeconds
        });
      }
      return res.status(400).json({ error: err.message || "Failed to resend verification code." });
    }
  } catch (error) {
    return next(error);
  }
});

// 4. Mobile Verification Status Probe
app.get("/api/auth/otp/status", requireAuth, async (req, res, next) => {
  try {
    const actorId = req.session.user.id;
    const result = await pool.query(
      "SELECT mobile, phone_verified, phone_verified_at FROM users WHERE id = $1 LIMIT 1",
      [actorId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      configured: isMsg91Configured(),
      mobile: user.mobile || null,
      phone: user.mobile || null,
      phoneVerified: Boolean(user.phone_verified),
      phone_verified: Boolean(user.phone_verified),
      phoneVerifiedAt: user.phone_verified_at || null,
      phone_verified_at: user.phone_verified_at || null
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// MSG91 Corporate Email OTP Authentication (Owner & Viewer)
// --------------------------------------------------

// 1. Request / Send 6-Digit Email OTP
app.post("/api/auth/email-otp/send", otpLimiter, async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Corporate email address is required." });
    }

    let normalizedEmail;
    try {
      normalizedEmail = normalizeEmail(rawEmail);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    // Master data check: Verify account exists and is eligible BEFORE sending OTP
    const userResult = await pool.query(
      `SELECT id, name, email, role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    // Reject unprovisioned accounts
    if (!user) {
      await writeAudit({
        actorId: null,
        action: "auth_email_otp_send",
        outcome: "denied",
        details: { email: normalizedEmail, reason: "Account not provisioned" }
      });
      return res.status(403).json({
        error: "This corporate email address is not provisioned in TrustVault. Please contact your organization administrator."
      });
    }

    // Reject admin accounts (Admins must authenticate using username and password)
    if (user.role === "admin") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_otp_send",
        outcome: "denied",
        details: { email: normalizedEmail, reason: "Admin account attempted OTP login" }
      });
      return res.status(403).json({
        error: "Administrator accounts must authenticate using username and password."
      });
    }

    // Reject inactive, suspended, or rejected accounts
    if (user.status !== "active") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_otp_send",
        outcome: "denied",
        details: { email: normalizedEmail, reason: `Account status is ${user.status}` }
      });
      return res.status(403).json({
        error: `Account is ${user.status}. Please contact an authorized administrator.`
      });
    }

    // Dispatch OTP via MSG91 Email OTP service
    try {
      const dispatchResult = await sendEmailOtp({ email: normalizedEmail, userName: user.name });

      await writeAudit({
        actorId: user.id,
        action: "auth_email_otp_send",
        outcome: "success",
        details: { email: normalizedEmail, role: user.role }
      });

      return res.json({
        success: true,
        message: dispatchResult.message || "Verification code dispatched to your corporate email.",
        cooldownSeconds: dispatchResult.cooldownSeconds || 60,
        email: normalizedEmail
      });
    } catch (otpErr) {
      if (otpErr.code === "COOLDOWN") {
        return res.status(429).json({
          error: otpErr.message,
          remainingSeconds: otpErr.remainingSeconds
        });
      }
      if (otpErr.code === "RATE_LIMIT_EXCEEDED") {
        return res.status(429).json({ error: otpErr.message });
      }

      await writeAudit({
        actorId: user.id,
        action: "auth_email_otp_send",
        outcome: "failure",
        details: { email: normalizedEmail, reason: otpErr.message }
      });

      console.error("[MSG91_EMAIL_OTP_DISPATCH_FAILURE]", otpErr.message);
      return res.status(503).json({
        error: otpErr.message || "Email OTP delivery service is currently unavailable. Please try again later."
      });
    }
  } catch (error) {
    return next(error);
  }
});

// 2. Verify 6-Digit Email OTP & Establish PostgreSQL-backed Session
app.post("/api/auth/email-otp/verify", otpVerifyLimiter, async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;
    const rawOtp = req.body?.otp;

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Corporate email address is required." });
    }

    if (!rawOtp || typeof rawOtp !== "string" || !/^\d{6}$/.test(rawOtp.trim())) {
      return res.status(400).json({ error: "Verification code must be exactly 6 numeric digits." });
    }

    let normalizedEmail;
    try {
      normalizedEmail = normalizeEmail(rawEmail);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    const cleanOtp = rawOtp.trim();

    // 1. Verify OTP with MSG91 server-side
    try {
      await verifyEmailOtp({ email: normalizedEmail, otp: cleanOtp });
    } catch (verErr) {
      if (verErr.code === "MAX_ATTEMPTS_EXCEEDED") {
        await writeAudit({
          actorId: null,
          action: "auth_email_otp_verify",
          outcome: "denied",
          details: { email: normalizedEmail, reason: "Max verification attempts exceeded" }
        });
        return res.status(429).json({
          error: verErr.message,
          lockoutRemaining: verErr.lockoutRemaining
        });
      }

      await writeAudit({
        actorId: null,
        action: "auth_email_otp_verify",
        outcome: "failure",
        details: { email: normalizedEmail, reason: verErr.message }
      });

      return res.status(400).json({
        error: verErr.message || "Invalid or expired verification code.",
        remainingAttempts: verErr.remainingAttempts
      });
    }

    // 2. RE-CHECK user status and role from PostgreSQL master data after verification
    const userRes = await pool.query(
      `SELECT id, name, email, role, status, avatar_url, terms_version, terms_accepted_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = userRes.rows[0];

    if (!user) {
      await writeAudit({
        actorId: null,
        action: "auth_email_otp_verify",
        outcome: "denied",
        details: { email: normalizedEmail, reason: "Account not provisioned in database" }
      });
      return res.status(403).json({
        error: "This corporate email address is not provisioned in TrustVault."
      });
    }

    // Role check: Admins cannot authenticate via OTP
    if (user.role === "admin") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_otp_verify",
        outcome: "denied",
        details: { email: normalizedEmail, reason: "Admin account cannot use OTP login" }
      });
      return res.status(403).json({
        error: "Administrator accounts are not permitted to log in via OTP. Use username and password."
      });
    }

    // Status check: reject inactive or suspended users
    if (user.status !== "active") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_otp_verify",
        outcome: "denied",
        details: { email: normalizedEmail, reason: `Account status is ${user.status}` }
      });
      return res.status(403).json({
        error: `Account is ${user.status}. Contact an authorized administrator.`
      });
    }

    // Single active session enforcement: Revoke existing active sessions for this user ID
    try {
      await pool.query(
        `DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text`,
        [String(user.id)]
      );
    } catch (_sessErr) {}

    pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]).catch(() => {});

    // Establish PostgreSQL-backed Express session with session regeneration
    req.session.regenerate((error) => {
      if (error) return next(error);

      // Role is STRICTLY assigned from database record (never trust frontend role input)
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role, // STRICTLY FROM DB
        status: user.status || "active",
        avatar_url: user.avatar_url || null
      };

      req.session.save(async (saveError) => {
        if (saveError) return next(saveError);

        await writeAudit({
          actorId: user.id,
          action: "auth_email_otp_login",
          outcome: "success",
          details: { role: user.role, status: user.status }
        });

        let csrfToken;
        try {
          csrfToken = generateCsrfToken(req, res);
        } catch (_csrfError) {}

        return res.json({
          success: true,
          user: req.session.user,
          ...(csrfToken ? { csrfToken } : {})
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

// 3. Retry / Resend 6-Digit Email OTP
app.post("/api/auth/email-otp/retry", otpLimiter, async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Corporate email address is required." });
    }

    let normalizedEmail;
    try {
      normalizedEmail = normalizeEmail(rawEmail);
    } catch (valErr) {
      return res.status(400).json({ error: valErr.message });
    }

    // Master data check
    const userResult = await pool.query(
      `SELECT id, name, email, role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];
    if (!user || user.role === "admin" || user.status !== "active") {
      return res.status(403).json({
        error: "Unable to resend verification code for this account."
      });
    }

    try {
      const retryResult = await retryEmailOtp({ email: normalizedEmail, userName: user.name });
      return res.json({
        success: true,
        message: retryResult.message || "Verification code resent successfully.",
        cooldownSeconds: retryResult.cooldownSeconds || 60
      });
    } catch (err) {
      if (err.code === "COOLDOWN") {
        return res.status(429).json({
          error: err.message,
          remainingSeconds: err.remainingSeconds
        });
      }
      if (err.code === "RATE_LIMIT_EXCEEDED") {
        return res.status(429).json({ error: err.message });
      }
      return res.status(503).json({
        error: err.message || "Unable to resend verification code at this time."
      });
    }
  } catch (error) {
    return next(error);
  }
});

// 4. Email OTP Configuration Status
app.get("/api/auth/email-otp/status", async (req, res, next) => {
  try {
    const status = getMsg91EmailConfigurationStatus();
    return res.json({
      configured: isMsg91EmailConfigured(),
      ...status
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Firebase Passwordless Email Link Authentication (Owner & Viewer)
// Architecture: Firebase generates the email link; the app-level token (stored
// as a SHA-256 hash) enforces the strict 10-minute server-side expiry window.
// Firebase ID token verification is ALWAYS performed independently.
// --------------------------------------------------

/**
 * Helper: get or create a cooldown record for an email, checking limits.
 * Returns { cooldownRemaining, tooManyRequests } via a Postgres client.
 */
async function checkEmailLinkCooldown(email, dbClient) {
  const db = dbClient || pool;

  // Fetch or create cooldown row
  const row = await db.query(
    `SELECT last_sent_at, send_count, window_start FROM email_link_cooldowns WHERE email = $1`,
    [email]
  );

  const now = new Date();

  if (row.rows[0]) {
    const { last_sent_at, send_count, window_start } = row.rows[0];
    const lastSentMs = new Date(last_sent_at).getTime();
    const windowStartMs = new Date(window_start).getTime();
    const elapsedSinceSendMs = now.getTime() - lastSentMs;
    const elapsedInWindowMs = now.getTime() - windowStartMs;

    // Cooldown check: must wait at least EMAIL_LINK_COOLDOWN_SECONDS between requests
    const cooldownRemainingMs = EMAIL_LINK_COOLDOWN_SECONDS * 1000 - elapsedSinceSendMs;
    if (cooldownRemainingMs > 0) {
      return { cooldownRemaining: Math.ceil(cooldownRemainingMs / 1000), tooManyRequests: false };
    }

    // Rate limit: reset window if past window duration
    const windowMs = EMAIL_LINK_WINDOW_HOURS * 60 * 60 * 1000;
    if (elapsedInWindowMs > windowMs) {
      // Window expired: reset count
      await db.query(
        `INSERT INTO email_link_cooldowns (email, last_sent_at, send_count, window_start)
         VALUES ($1, $2, 1, $2)
         ON CONFLICT (email) DO UPDATE
         SET last_sent_at = $2, send_count = 1, window_start = $2`,
        [email, now]
      );
      return { cooldownRemaining: 0, tooManyRequests: false };
    }

    // Within window: check if max sends exceeded
    if (send_count >= EMAIL_LINK_MAX_PER_WINDOW) {
      const windowResetMs = windowMs - elapsedInWindowMs;
      return { cooldownRemaining: 0, tooManyRequests: true, windowResetSeconds: Math.ceil(windowResetMs / 1000) };
    }

    // Update count
    await db.query(
      `INSERT INTO email_link_cooldowns (email, last_sent_at, send_count, window_start)
       VALUES ($1, $2, 1, $2)
       ON CONFLICT (email) DO UPDATE
       SET last_sent_at = $2, send_count = email_link_cooldowns.send_count + 1`,
      [email, now]
    );
    return { cooldownRemaining: 0, tooManyRequests: false };
  }

  // No row: first request
  await db.query(
    `INSERT INTO email_link_cooldowns (email, last_sent_at, send_count, window_start)
     VALUES ($1, $2, 1, $2)
     ON CONFLICT (email) DO UPDATE
     SET last_sent_at = $2, send_count = 1, window_start = $2`,
    [email, now]
  );
  return { cooldownRemaining: 0, tooManyRequests: false };
}

/**
 * Helper: revoke all outstanding (unexpired, unconsumed) tokens for a user.
 */
async function revokeOutstandingEmailLinkTokens(userId, dbClient) {
  const db = dbClient || pool;
  await db.query(
    `UPDATE email_link_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`,
    [userId]
  );
}

// 1. POST /api/auth/email-link/send — Request a Firebase sign-in link
app.post("/api/auth/email-link/send", emailLinkSendLimiter, async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Email address is required." });
    }

    // Normalize email
    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    // Look up user in PostgreSQL — check provisioned and active
    const userResult = await pool.query(
      `SELECT id, name, email, role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    // Use generic error to avoid email enumeration
    if (!user) {
      await writeAudit({
        actorId: null,
        action: "auth_email_link_send",
        outcome: "denied",
        details: { reason: "Account not provisioned (generic response returned)" }
      });
      // Intentional: same success-shaped response for unprovisioned emails
      return res.json({
        success: true,
        message: "If this email is registered, a secure sign-in link has been sent.",
        cooldownSeconds: EMAIL_LINK_COOLDOWN_SECONDS,
        expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES
      });
    }

    // Reject admin accounts
    if (user.role === "admin") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_send",
        outcome: "denied",
        details: { reason: "Admin account cannot use email-link authentication" }
      });
      return res.status(403).json({
        error: "Administrator accounts must authenticate using username and password."
      });
    }

    // Reject inactive/suspended/rejected accounts
    if (user.status !== "active") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_send",
        outcome: "denied",
        details: { reason: `Account status is ${user.status}` }
      });
      return res.status(403).json({
        error: `Account is ${user.status}. Please contact an authorized administrator.`
      });
    }

    // Check cooldown and per-window rate limit
    const cooldownCheck = await checkEmailLinkCooldown(normalizedEmail, null);
    if (cooldownCheck.cooldownRemaining > 0) {
      return res.status(429).json({
        error: `Please wait ${cooldownCheck.cooldownRemaining} seconds before requesting another link.`,
        cooldownRemaining: cooldownCheck.cooldownRemaining
      });
    }
    if (cooldownCheck.tooManyRequests) {
      return res.status(429).json({
        error: "Too many sign-in link requests. Please try again later.",
        windowResetSeconds: cooldownCheck.windowResetSeconds
      });
    }

    // Revoke any outstanding tokens for this user (one active link at a time)
    await revokeOutstandingEmailLinkTokens(user.id, null);

    // Generate cryptographically secure application token (10-minute expiry)
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + EMAIL_LINK_EXPIRY_MINUTES * 60 * 1000);

    const ipAddress = (req.ip || req.connection?.remoteAddress || "").slice(0, 45);
    const userAgent = ((req.headers["user-agent"] || "")).slice(0, 512);

    await pool.query(
      `INSERT INTO email_link_tokens (user_id, token_hash, email, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, tokenHash, normalizedEmail, expiresAt, ipAddress, userAgent]
    );

    // Generate Firebase sign-in link via Admin SDK (embeds rawToken in continuation URL)
    const frontendOriginForLink = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim().replace(/\/+$/, "");
    const continueUrl = `${frontendOriginForLink}/login/callback`;

    let signInLink;
    try {
      signInLink = await generateFirebaseSignInLink(normalizedEmail, rawToken, continueUrl);
    } catch (fbErr) {
      // If Firebase Admin can't generate the link, revoke the token and fail gracefully
      await pool.query(
        `UPDATE email_link_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        [tokenHash]
      );
      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_send",
        outcome: "failure",
        details: { reason: `Firebase link generation failed: ${fbErr.message}` }
      });
      return res.status(503).json({
        error: "Unable to send sign-in link. Firebase is not fully configured. Please provide FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in backend/.env, or contact your administrator."
      });
    }

    // Deliver the secure link via configured email transport
    let deliveryResult;
    try {
      deliveryResult = await sendSignInLinkEmail({
        to: normalizedEmail,
        signInLink,
        expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES
      });
    } catch (deliveryErr) {
      deliveryResult = {
        success: false,
        provider: "SMTP",
        category: "DISPATCH_ERROR",
        code: deliveryErr.code || "UNKNOWN",
        error: deliveryErr.message
      };
    }

    if (!deliveryResult || !deliveryResult.success) {
      // Invalidate the un-deliverable token so dangling active tokens are not left in DB
      await pool.query(
        `UPDATE email_link_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        [tokenHash]
      );

      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_send",
        outcome: "failure",
        details: {
          reason: `Email delivery failed: ${deliveryResult?.category || "DISPATCH_ERROR"} (${deliveryResult?.code || deliveryResult?.reason || "unknown"})`,
          provider: deliveryResult?.provider || "UNKNOWN"
        }
      });

      return res.status(503).json({
        error: deliveryResult?.category === "CONFIGURATION_MISSING"
          ? "Email delivery service is currently unconfigured. Please configure SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) in backend/.env to send sign-in emails."
          : "Unable to dispatch sign-in email. Please check your SMTP server settings or try again later.",
        code: deliveryResult?.code || "EMAIL_DELIVERY_FAILED"
      });
    }

    // Email delivered successfully via configured transport. Never log raw tokens or links.
    await writeAudit({
      actorId: user.id,
      action: "auth_email_link_send",
      outcome: "success",
      details: {
        role: user.role,
        expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES,
        provider: deliveryResult.provider,
        messageId: deliveryResult.messageId
      }
    });

    return res.json({
      success: true,
      message: "A secure sign-in link has been sent to your email address. It expires in 10 minutes.",
      cooldownSeconds: EMAIL_LINK_COOLDOWN_SECONDS,
      expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

// 2. POST /api/auth/email-link/regenerate — Regenerate a new link (resend flow)
app.post("/api/auth/email-link/regenerate", emailLinkSendLimiter, async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;

    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Email address is required." });
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    // Look up user
    const userResult = await pool.query(
      `SELECT id, name, email, role, status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    if (!user || user.role === "admin" || user.status !== "active") {
      // Generic response for security
      return res.json({
        success: true,
        message: "If this email is registered and eligible, a new sign-in link has been sent.",
        cooldownSeconds: EMAIL_LINK_COOLDOWN_SECONDS,
        expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES
      });
    }

    // Check cooldown
    const cooldownCheck = await checkEmailLinkCooldown(normalizedEmail, null);
    if (cooldownCheck.cooldownRemaining > 0) {
      return res.status(429).json({
        error: `Please wait ${cooldownCheck.cooldownRemaining} seconds before requesting another link.`,
        cooldownRemaining: cooldownCheck.cooldownRemaining
      });
    }
    if (cooldownCheck.tooManyRequests) {
      return res.status(429).json({
        error: "Too many sign-in link requests. Please try again later.",
        windowResetSeconds: cooldownCheck.windowResetSeconds
      });
    }

    // Revoke all previous outstanding tokens (previous links become invalid)
    await revokeOutstandingEmailLinkTokens(user.id, null);

    // Generate new application token
    const { rawToken, tokenHash } = generateSecureToken();
    const expiresAt = new Date(Date.now() + EMAIL_LINK_EXPIRY_MINUTES * 60 * 1000);
    const ipAddress = (req.ip || req.connection?.remoteAddress || "").slice(0, 45);
    const userAgent = ((req.headers["user-agent"] || "")).slice(0, 512);

    await pool.query(
      `INSERT INTO email_link_tokens (user_id, token_hash, email, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, tokenHash, normalizedEmail, expiresAt, ipAddress, userAgent]
    );

    // Generate new Firebase sign-in link
    const frontendOriginForLink = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim().replace(/\/+$/, "");
    const continueUrl = `${frontendOriginForLink}/login/callback`;

    let signInLink;
    try {
      signInLink = await generateFirebaseSignInLink(normalizedEmail, rawToken, continueUrl);
    } catch (fbErr) {
      await pool.query(
        `UPDATE email_link_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        [tokenHash]
      );
      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_regenerate",
        outcome: "failure",
        details: { reason: `Firebase link generation failed: ${fbErr.message}` }
      });
      return res.status(503).json({
        error: "Unable to send sign-in link. Firebase is not fully configured. Please contact your administrator."
      });
    }

    // Deliver the regenerated link via configured email transport
    let deliveryResult;
    try {
      deliveryResult = await sendSignInLinkEmail({
        to: normalizedEmail,
        signInLink,
        expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES
      });
    } catch (deliveryErr) {
      deliveryResult = {
        success: false,
        provider: "SMTP",
        category: "DISPATCH_ERROR",
        code: deliveryErr.code || "UNKNOWN",
        error: deliveryErr.message
      };
    }

    if (!deliveryResult || !deliveryResult.success) {
      await pool.query(
        `UPDATE email_link_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        [tokenHash]
      );

      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_regenerate",
        outcome: "failure",
        details: {
          reason: `Email delivery failed: ${deliveryResult?.category || "DISPATCH_ERROR"} (${deliveryResult?.code || deliveryResult?.reason || "unknown"})`,
          provider: deliveryResult?.provider || "UNKNOWN"
        }
      });

      return res.status(503).json({
        error: deliveryResult?.category === "CONFIGURATION_MISSING"
          ? "Email delivery service is currently unconfigured. Please configure SMTP credentials (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) in backend/.env to send sign-in emails."
          : "Unable to dispatch sign-in email. Please check your SMTP server settings or try again later.",
        code: deliveryResult?.code || "EMAIL_DELIVERY_FAILED"
      });
    }

    await writeAudit({
      actorId: user.id,
      action: "auth_email_link_regenerate",
      outcome: "success",
      details: {
        role: user.role,
        expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES,
        provider: deliveryResult.provider,
        messageId: deliveryResult.messageId
      }
    });

    return res.json({
      success: true,
      message: "A new sign-in link has been sent. It expires in 10 minutes.",
      cooldownSeconds: EMAIL_LINK_COOLDOWN_SECONDS,
      expiresInMinutes: EMAIL_LINK_EXPIRY_MINUTES,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

// 3. POST /api/auth/email-link/complete — Verify Firebase ID token + app token, establish session
app.post("/api/auth/email-link/complete", emailLinkCompleteLimiter, async (req, res, next) => {
  try {
    const { idToken, apiToken } = req.body || {};

    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ error: "Firebase ID token is required." });
    }

    if (!apiToken || typeof apiToken !== "string" || apiToken.length < 10) {
      return res.status(400).json({ error: "Application token is required." });
    }

    // 1. Verify Firebase ID token (always done first, independent of app token)
    let decodedToken;
    try {
      decodedToken = await verifyFirebaseIdToken(idToken.trim());
    } catch (verErr) {
      await writeAudit({
        actorId: null,
        action: "auth_email_link_complete",
        outcome: "failure",
        details: { reason: `Firebase ID token verification failed: ${verErr.message}` }
      });
      return res.status(401).json({
        error: "Firebase token verification failed. The sign-in link may be invalid or already used."
      });
    }

    const firebaseEmail = decodedToken?.email;
    if (!firebaseEmail || !validEmail(firebaseEmail)) {
      await writeAudit({
        actorId: null,
        action: "auth_email_link_complete",
        outcome: "failure",
        details: { reason: "Firebase token missing verified email" }
      });
      return res.status(400).json({
        error: "Firebase token does not contain a verified email address."
      });
    }

    const normalizedFirebaseEmail = firebaseEmail.trim().toLowerCase();

    // 2. Hash the supplied application token and look it up
    const suppliedHash = hashToken(apiToken.trim());

    // Atomic: SELECT and UPDATE in one round-trip to prevent race conditions
    const tokenResult = await pool.query(
      `UPDATE email_link_tokens
       SET consumed_at = NOW()
       WHERE token_hash = $1
         AND consumed_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > NOW()
         AND LOWER(email) = LOWER($2)
       RETURNING id, user_id, email, expires_at, created_at`,
      [suppliedHash, normalizedFirebaseEmail]
    );

    if (tokenResult.rows.length === 0) {
      // Distinguish reason for better auditability (but generic user-facing message)
      const expiredCheck = await pool.query(
        `SELECT id, consumed_at, revoked_at, expires_at FROM email_link_tokens
         WHERE token_hash = $1 LIMIT 1`,
        [suppliedHash]
      );
      let reason = "Token not found";
      if (expiredCheck.rows[0]) {
        const t = expiredCheck.rows[0];
        if (t.consumed_at) reason = "Token already used";
        else if (t.revoked_at) reason = "Token was revoked";
        else if (new Date(t.expires_at) <= new Date()) reason = "Token expired (10-minute window elapsed)";
        else if (t.email && t.email.toLowerCase() !== normalizedFirebaseEmail) reason = "Email mismatch";
      }

      await writeAudit({
        actorId: null,
        action: "auth_email_link_complete",
        outcome: "denied",
        details: { reason }
      });

      // Use specific error messages so the frontend can present the right state
      if (reason === "Token already used") {
        return res.status(401).json({ error: "This sign-in link has already been used. Please request a new one.", code: "LINK_USED" });
      }
      if (reason === "Token was revoked") {
        return res.status(401).json({ error: "This sign-in link is no longer valid. Please request a new one.", code: "LINK_REVOKED" });
      }
      if (reason.includes("expired")) {
        return res.status(401).json({ error: "This verification link has expired. Generate a new link to continue.", code: "LINK_EXPIRED" });
      }
      return res.status(401).json({ error: "Invalid or expired sign-in link. Please request a new one.", code: "LINK_INVALID" });
    }

    const tokenRow = tokenResult.rows[0];
    const userId = tokenRow.user_id;

    // 3. Re-verify user in PostgreSQL (role and status from DB, never from token)
    const userResult = await pool.query(
      `SELECT id, name, email, role, status, avatar_url, terms_version, terms_accepted_at
       FROM users
       WHERE id = $1 AND LOWER(email) = LOWER($2)
       LIMIT 1`,
      [userId, normalizedFirebaseEmail]
    );

    const user = userResult.rows[0];

    if (!user) {
      await writeAudit({
        actorId: userId,
        action: "auth_email_link_complete",
        outcome: "denied",
        details: { reason: "User not found or email mismatch in DB" }
      });
      return res.status(403).json({
        error: "Authentication failed. Account not found or email mismatch."
      });
    }

    if (user.role === "admin") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_complete",
        outcome: "denied",
        details: { reason: "Admin account cannot use email-link authentication" }
      });
      return res.status(403).json({
        error: "Administrator accounts must authenticate using username and password."
      });
    }

    if (user.status !== "active") {
      await writeAudit({
        actorId: user.id,
        action: "auth_email_link_complete",
        outcome: "denied",
        details: { reason: `Account is ${user.status}` }
      });
      return res.status(403).json({
        error: `Account is ${user.status}. Please contact an authorized administrator.`
      });
    }

    // 4. Single active session enforcement
    try {
      await pool.query(
        `DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text`,
        [String(user.id)]
      );
    } catch (_sessErr) {}

    pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]).catch(() => {});

    // 5. Regenerate session and establish authenticated TrustVault session
    req.session.regenerate((error) => {
      if (error) return next(error);

      // Role is STRICTLY from PostgreSQL — never from Firebase token or client input
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || "active",
        avatar_url: user.avatar_url || null
      };

      req.session.save(async (saveError) => {
        if (saveError) return next(saveError);

        await writeAudit({
          actorId: user.id,
          action: "auth_email_link_login",
          outcome: "success",
          details: { role: user.role, status: user.status, method: "firebase_email_link" }
        });

        let csrfToken;
        try {
          csrfToken = generateCsrfToken(req, res);
        } catch (_csrfError) {}

        return res.json({
          success: true,
          user: req.session.user,
          ...(csrfToken ? { csrfToken } : {})
        });
      });
    });
  } catch (error) {
    return next(error);
  }
});

// 4. GET /api/auth/email-link/status — Check token status (used by frontend countdown)
app.get("/api/auth/email-link/status", async (req, res, next) => {
  try {
    const rawToken = req.query?.token;
    if (!rawToken || typeof rawToken !== "string" || rawToken.length < 10) {
      return res.status(400).json({ error: "Token is required." });
    }

    const tokenHash = hashToken(rawToken.trim());
    const result = await pool.query(
      `SELECT expires_at, consumed_at, revoked_at FROM email_link_tokens
       WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ valid: false, reason: "not_found" });
    }

    const t = result.rows[0];
    const now = new Date();

    if (t.consumed_at) {
      return res.json({ valid: false, reason: "used" });
    }
    if (t.revoked_at) {
      return res.json({ valid: false, reason: "revoked" });
    }
    if (new Date(t.expires_at) <= now) {
      return res.json({ valid: false, reason: "expired", expiredAt: t.expires_at });
    }

    const remainingMs = new Date(t.expires_at).getTime() - now.getTime();
    return res.json({
      valid: true,
      expiresAt: t.expires_at,
      remainingSeconds: Math.ceil(remainingMs / 1000)
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Upload encrypted document
// --------------------------------------------------

app.post(
  "/api/documents",
  requireAuth,
  upload.single("file"),
  async (req, res, next) => {
    let client;
    let transactionStarted = false;
    let storageKey = null;
    let fileWritten = false;

    try {
      if (req.session.user.role === "viewer") {
        await writeAudit({
          actorId: req.session.user.id,
          action: "document_upload",
          outcome: "denied",
          details: { reason: "Viewer role cannot upload documents" }
        });

        return res.status(403).json({
          error: "Viewers cannot upload documents"
        });
      }

      if (req.session.user.role === "owner") {
        const userCheck = await pool.query("SELECT status FROM users WHERE id = $1", [req.session.user.id]);
        if (userCheck.rows[0]) {
          req.session.user.status = userCheck.rows[0].status;
        }

        if (req.session.user.status === "pending") {
          await writeAudit({
            actorId: req.session.user.id,
            action: "document_upload",
            outcome: "denied",
            details: { reason: "Owner account pending administrative approval" }
          });

          return res.status(403).json({
            error: "Your Owner account is pending administrative approval before documents can be uploaded."
          });
        }
      }

      if (!req.file) {
        await writeAudit({
          actorId: req.session.user.id,
          action: "document_upload",
          outcome: "failure",
          details: { reason: "No file supplied" }
        });

        return res.status(400).json({
          error: "A file is required"
        });
      }

      const name = sanitizeFilename(req.file.originalname);

      if (!name || name.length > 255 || req.file.size <= 0) {
        await writeAudit({
          actorId: req.session.user.id,
          action: "document_upload",
          outcome: "failure",
          details: {
            reason: "Invalid filename or empty file"
          }
        });

        return res.status(400).json({
          error: "Invalid filename or empty file"
        });
      }

      const category =
        typeof req.body?.category === "string" &&
        req.body.category.trim().length > 0 &&
        req.body.category.trim().length <= 100
          ? req.body.category.trim()
          : null;

      const detectedMime = detectMimeType(
        req.file.buffer,
        req.file.mimetype
      );

      // Generate unique per-document 256-bit Data Encryption Key (DEK)
      const dek = generateKeyBytes();
      const encryptedDoc = encryptDocumentWithDek(req.file.buffer, dek);
      const activeKey = await getActiveManagedKey(pool);
      const wrappedDek = wrapKey(dek, activeKey.keyBytes);
      const envelope = createTVE2Envelope(
        encryptedDoc.ivHex,
        encryptedDoc.authTagHex,
        encryptedDoc.ciphertext
      );
      storageKey = crypto.randomBytes(32).toString("hex");

      await saveEncryptedFile(storageKey, envelope);
      fileWritten = true;

      client = await pool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const timerEnabled =
        req.body?.timer_enabled === "true" ||
        req.body?.timer_enabled === true ||
        req.body?.timerEnabled === "true" ||
        req.body?.timerEnabled === true;

      const timerDuration = Number(
        req.body?.timer_duration_minutes || req.body?.timerMinutes || 5
      );

      const autoDelete =
        req.body?.auto_delete !== "false" &&
        req.body?.auto_delete !== false &&
        req.body?.autoDelete !== "false" &&
        req.body?.autoDelete !== false;

      const rawSecret =
        typeof req.body?.secret_key === "string" && req.body.secret_key.trim()
          ? req.body.secret_key.trim()
          : typeof req.body?.secretKey === "string" && req.body.secretKey.trim()
          ? req.body.secretKey.trim()
          : null;

      const secretKey = rawSecret;
      const secretKeyHash = secretKey
        ? crypto.createHash("sha256").update(secretKey).digest("hex")
        : null;

      const result = await client.query(
        `INSERT INTO documents
           (owner_id, name, category, storage_key, mime_type, size_bytes,
            timer_enabled, timer_duration_minutes, auto_delete, secret_key_hash,
            encryption_version, key_id, wrapped_dek, iv, auth_tag)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 2, $11, $12, $13, $14)
         RETURNING id, owner_id, name, category, mime_type,
                   size_bytes, timer_enabled, timer_duration_minutes, auto_delete,
                   encryption_version, key_id, created_at, updated_at`,
        [
          req.session.user.id,
          name,
          category,
          storageKey,
          detectedMime,
          req.file.size,
          timerEnabled,
          timerDuration,
          autoDelete,
          secretKeyHash,
          activeKey.id,
          wrappedDek,
          encryptedDoc.ivHex,
          encryptedDoc.authTagHex
        ]
      );

      const document = result.rows[0];

      await writeAudit({
        actorId: req.session.user.id,
        action: "document_upload",
        documentId: document.id,
        outcome: "success",
        details: {
          filename: name,
          sizeBytes: req.file.size,
          mimeType: detectedMime,
          encryption: "AES-256-GCM / Envelope DEK",
          encryptionVersion: 2,
          keyId: activeKey.id
        },
        db: client
      });

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(201).json({
        message: "Document uploaded successfully",
        document: {
          ...document,
          access_level: "owner"
        }
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackError) {
          // Preserve the original error.
        }
      }

      if (fileWritten && storageKey) {
        await deleteEncryptedFile(storageKey);
      }

      return next(error);

    } finally {
      if (client) client.release();
    }
  }
);

// --------------------------------------------------
// List and search accessible documents
// Query parameters: name, owner, category, from, to, limit, offset
// --------------------------------------------------

app.get("/api/documents", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { name, owner, category, from, to, limit: reqLimit, offset: reqOffset } =
      req.query;

    const conditions = [
      "(d.owner_id = $1 OR dp.user_id IS NOT NULL)"
    ];

    const values = [userId];

    function addFilter(sql, value) {
      values.push(value);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    if (typeof name === "string" && name.trim()) {
      addFilter(
        "d.name ILIKE ?",
        `%${escapeLike(name.trim().slice(0, 255))}%`
      );
    }

    if (typeof category === "string" && category.trim()) {
      addFilter(
        "d.category ILIKE ?",
        `%${escapeLike(category.trim().slice(0, 100))}%`
      );
    }

    if (typeof owner === "string" && owner.trim()) {
      values.push(`%${escapeLike(owner.trim().slice(0, 255))}%`);

      conditions.push(
        `(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`
      );
    }

    if (typeof from === "string" && from.trim()) {
      if (!isValidCalendarDate(from)) {
        return res.status(400).json({
          error: "Invalid from date"
        });
      }

      addFilter("d.created_at >= ?::date", from.trim());
    }

    if (typeof to === "string" && to.trim()) {
      if (!isValidCalendarDate(to)) {
        return res.status(400).json({
          error: "Invalid to date"
        });
      }

      addFilter(
        "d.created_at < (?::date + INTERVAL '1 day')",
        to.trim()
      );
    }

    if (
      typeof from === "string" &&
      typeof to === "string" &&
      from.trim() &&
      to.trim() &&
      from.trim() > to.trim()
    ) {
      return res.status(400).json({
        error: "Invalid date range: 'from' must be before or equal to 'to'"
      });
    }

    const parsedLimit = Number(reqLimit || 500);
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 500)
        : 500;

    const parsedOffset = Number(reqOffset || 0);
    const offset =
      Number.isInteger(parsedOffset) && parsedOffset >= 0
        ? parsedOffset
        : 0;

    values.push(limit);
    const limitParam = `$${values.length}`;

    values.push(offset);
    const offsetParam = `$${values.length}`;

    const result = await pool.query(
      `SELECT d.id, d.owner_id, d.name, d.category, d.mime_type,
              d.size_bytes, d.created_at, d.updated_at,
              d.timer_enabled, d.timer_duration_minutes, d.auto_delete, d.unlocked_at,
              u.name AS owner_name, u.email AS owner_email,
              CASE
                WHEN d.owner_id = $1 THEN 'owner'
                ELSE dp.permission
              END AS access_level
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       LEFT JOIN document_permissions dp
         ON dp.document_id = d.id AND dp.user_id = $1
       WHERE ${conditions.join(" AND ")}
       ORDER BY d.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    );

    return res.json({
      documents: result.rows
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Document download history (unprivileged & all users)
// Must be mounted before /api/documents/:id to avoid parameter shadowing
// --------------------------------------------------

const getDownloadHistoryHandler = async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const result = await pool.query(`
      SELECT a.id, a.action, a.document_id, a.outcome, a.created_at, a.details,
             d.name AS document_name, d.category, d.size_bytes,
             owner.name AS owner_name, owner.email AS owner_email
      FROM audit_logs a
      JOIN documents d ON d.id = a.document_id
      JOIN users owner ON owner.id = d.owner_id
      WHERE a.actor_id = $1 AND a.action = 'document_download' AND a.outcome = 'success'
      ORDER BY a.created_at DESC
      LIMIT 100
    `, [userId]);

    return res.json({
      history: result.rows,
      downloads: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    return next(error);
  }
};

app.get("/api/documents/history", requireAuth, getDownloadHistoryHandler);
app.get("/api/documents/download-history", requireAuth, getDownloadHistoryHandler);
app.get("/api/documents/downloads", requireAuth, getDownloadHistoryHandler);

// --------------------------------------------------
// Read document metadata
// --------------------------------------------------

app.get("/api/documents/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const actorId = req.session.user.id;

    if (!validDocumentId(id)) {
      await writeAudit({
        actorId,
        action: "document_read",
        outcome: "denied",
        details: { reason: "Invalid document ID" }
      });

      return res.status(404).json({
        error: "Document not found"
      });
    }

    const document = await findAccessibleDocument(id, actorId);

    if (!document) {
      await writeAudit({
        actorId,
        action: "document_read",
        documentId: id,
        outcome: "denied",
        details: {
          reason: "Missing document or access denied"
        }
      });

      return res.status(404).json({
        error: "Document not found"
      });
    }

    await writeAudit({
      actorId,
      action: "document_read",
      documentId: document.id,
      outcome: "success"
    });

    return res.json({ document });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Edit document metadata
// Owner or edit permission required (atomic with DB lock)
// --------------------------------------------------

app.patch(
  "/api/documents/:id",
  requireAuth,
  async (req, res, next) => {
    let client;

    try {
      const { id } = req.params;
      const userId = req.session.user.id;
      const {
        name,
        category,
        timer_enabled,
        timer_duration_minutes,
        auto_delete
      } = req.body || {};

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId: userId,
          action: "document_update",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      if (
        name !== undefined &&
        (
          typeof name !== "string" ||
          !sanitizeFilename(name) ||
          sanitizeFilename(name).length > 255
        )
      ) {
        return res.status(400).json({
          error: "Invalid document name"
        });
      }

      if (
        category !== undefined &&
        category !== null &&
        (
          typeof category !== "string" ||
          category.trim().length > 100
        )
      ) {
        return res.status(400).json({
          error: "Invalid category"
        });
      }

      if (
        name === undefined &&
        category === undefined &&
        timer_enabled === undefined &&
        timer_duration_minutes === undefined &&
        auto_delete === undefined
      ) {
        return res.status(400).json({
          error: "At least one field is required to update"
        });
      }

      const updatedName =
        name === undefined ? null : sanitizeFilename(name);

      const updatedCategory =
        category === undefined
          ? null
          : (
              category === null || category.trim() === ""
                ? null
                : category.trim()
            );

      client = await pool.connect();
      await client.query("BEGIN");

      try {
        const result = await client.query(
          `UPDATE documents
           SET name = COALESCE($1, name),
               category = CASE
                 WHEN $2::boolean THEN $3
                 ELSE category
               END,
               timer_enabled = CASE
                 WHEN $4::boolean THEN $5::boolean
                 ELSE timer_enabled
               END,
               timer_duration_minutes = CASE
                 WHEN $6::boolean THEN $7::int
                 ELSE timer_duration_minutes
               END,
               auto_delete = CASE
                 WHEN $8::boolean THEN $9::boolean
                 ELSE auto_delete
               END,
               updated_at = NOW()
           WHERE id = $10
             AND (
               owner_id = $11
               OR EXISTS (
                 SELECT 1 FROM document_permissions
                 WHERE document_id = $10 AND user_id = $11 AND permission = 'edit'
               )
             )
           RETURNING id, owner_id, name, category, mime_type,
                     size_bytes, timer_enabled, timer_duration_minutes, auto_delete, created_at, updated_at`,
          [
            updatedName,
            category !== undefined,
            updatedCategory,
            timer_enabled !== undefined,
            Boolean(timer_enabled),
            timer_duration_minutes !== undefined,
            Number(timer_duration_minutes || 5),
            auto_delete !== undefined,
            Boolean(auto_delete),
            id,
            userId
          ]
        );

        if (!result.rows[0]) {
          await client.query("ROLLBACK");

          await writeAudit({
            actorId: userId,
            action: "document_update",
            documentId: id,
            outcome: "denied",
            details: {
              reason: "Document missing or edit access denied"
            }
          });

          return res.status(404).json({
            error: "Document not found"
          });
        }

        await writeAudit({
          actorId: userId,
          action: "document_update",
          documentId: id,
          outcome: "success",
          details: {
            nameChanged: name !== undefined,
            categoryChanged: category !== undefined
          },
          db: client
        });

        await client.query("COMMIT");

        return res.json({
          document: result.rows[0]
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      return next(error);
    } finally {
      if (client) client.release();
    }
  }
);


// --------------------------------------------------
// In-App Document Preview (Secure Viewer Endpoint)
// --------------------------------------------------

app.get(
  "/api/documents/:id/preview",
  requireAuth,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId,
          action: "document_preview",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      // Query document checking owner OR active permission in document_permissions
      const result = await pool.query(
        `SELECT d.id, d.owner_id, d.name, d.mime_type, d.storage_key, d.size_bytes,
                d.secret_key_hash, d.unlocked_at, d.timer_enabled, d.timer_duration_minutes, d.auto_delete,
                d.encryption_version, d.key_id, d.wrapped_dek, d.iv, d.auth_tag,
                dp.permission
         FROM documents d
         LEFT JOIN document_permissions dp
           ON dp.document_id = d.id AND dp.user_id = $2
         WHERE d.id = $1
           AND (d.owner_id = $2 OR dp.permission IN ('read', 'edit') OR (SELECT role FROM users WHERE id = $2) = 'admin')
         LIMIT 1`,
        [id, actorId]
      );

      const document = result.rows[0];

      if (!document) {
        await writeAudit({
          actorId,
          action: "document_preview",
          documentId: id,
          outcome: "denied",
          details: {
            reason: "Document not found or permission revoked"
          }
        });

        return res.status(404).json({
          error: "Document not found or access denied"
        });
      }

      // Check if document encryption key is revoked
      if (document.key_id) {
        const keyCheck = await pool.query(
          "SELECT status FROM encryption_keys WHERE id = $1",
          [document.key_id]
        );
        if (keyCheck.rows[0]?.status === "revoked") {
          await writeAudit({
            actorId,
            action: "document_preview",
            documentId: document.id,
            outcome: "denied",
            details: { reason: "Document encryption key has been revoked" }
          });

          return res.status(403).json({
            error: "Document encryption key has been revoked"
          });
        }
      }

      // Access key / timer verification for non-owners
      if (document.owner_id !== actorId && document.secret_key_hash) {
        if (!document.unlocked_at) {
          await writeAudit({
            actorId,
            action: "document_preview",
            documentId: document.id,
            outcome: "denied",
            details: { reason: "Document is locked with an access key" }
          });

          return res.status(403).json({
            error: "Document is locked with an access key / secret key. Please enter the required key to view.",
            locked: true
          });
        }

        if (document.timer_enabled && document.unlocked_at) {
          const elapsedMinutes = (Date.now() - new Date(document.unlocked_at).getTime()) / 60000;
          if (elapsedMinutes > Number(document.timer_duration_minutes || 5)) {
            await writeAudit({
              actorId,
              action: "document_preview",
              documentId: document.id,
              outcome: "denied",
              details: { reason: "Document access timer expired" }
            });

            return res.status(403).json({
              error: "Document access timer has expired. Please enter the access key again.",
              expired: true
            });
          }
        }
      }

      let envelope;
      try {
        envelope = await readEncryptedFile(document.storage_key);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== 404 && error.status !== 404) throw error;

        await writeAudit({
          actorId,
          action: "document_preview",
          documentId: document.id,
          outcome: "failure",
          details: { reason: "Stored file missing" }
        });

        return res.status(404).json({
          error: "File not found"
        });
      }

      let plaintext;
      try {
        const magic = envelope.subarray(0, 4).toString("ascii");
        if (magic === "TVE2" && document.wrapped_dek) {
          const keyObj = await getManagedKeyBytes(pool, document.key_id);
          const dek = unwrapKey(document.wrapped_dek, keyObj.keyBytes);
          plaintext = decryptEnvelope(envelope, dek);
        } else {
          plaintext = decryptEnvelope(envelope);
        }

        if (plaintext.length !== Number(document.size_bytes)) {
          throw new Error("File size verification failed");
        }
      } catch (_error) {
        await writeAudit({
          actorId,
          action: "document_preview",
          documentId: document.id,
          outcome: "failure",
          details: { reason: "Encrypted file authentication failed" }
        });

        return res.status(500).json({
          error: "File integrity verification failed"
        });
      }

      await writeAudit({
        actorId,
        action: "document_preview",
        documentId: document.id,
        outcome: "success",
        details: { encryption: "AES-256-GCM", viewMode: "in_app" }
      });

      // Strict security headers for preview:
      // Disallow caching, enforce inline disposition, prevent script execution
      const ext = path.extname(document.name || "").toLowerCase();
      let safeMime = "application/octet-stream";

      if (document.mime_type === "application/pdf" || ext === ".pdf") {
        safeMime = "application/pdf";
      } else if (document.mime_type === "image/png" || ext === ".png") {
        safeMime = "image/png";
      } else if (document.mime_type === "image/jpeg" || ext === ".jpg" || ext === ".jpeg") {
        safeMime = "image/jpeg";
      } else if (document.mime_type === "image/gif" || ext === ".gif") {
        safeMime = "image/gif";
      } else if (document.mime_type === "image/webp" || ext === ".webp") {
        safeMime = "image/webp";
      } else if (document.mime_type === "text/plain" || ext === ".txt") {
        safeMime = "text/plain; charset=utf-8";
      }

      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Disposition": "inline",
        "Content-Type": safeMime
      });

      return res.send(plaintext);
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// Secure Viewer-Side In-Browser Decryption Package Endpoint
// Releases unwrapped DEK and ciphertext strictly to authorized users
// --------------------------------------------------

app.get(
  "/api/documents/:id/preview-package",
  requireAuth,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId,
          action: "document_preview",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      // Query document checking owner OR active permission in document_permissions
      const result = await pool.query(
        `SELECT d.id, d.owner_id, d.name, d.mime_type, d.storage_key, d.size_bytes,
                d.secret_key_hash, d.unlocked_at, d.timer_enabled, d.timer_duration_minutes, d.auto_delete,
                d.encryption_version, d.key_id, d.wrapped_dek, d.iv, d.auth_tag,
                dp.permission
         FROM documents d
         LEFT JOIN document_permissions dp
           ON dp.document_id = d.id AND dp.user_id = $2
         WHERE d.id = $1
           AND (d.owner_id = $2 OR dp.permission IN ('read', 'edit') OR (SELECT role FROM users WHERE id = $2) = 'admin')
         LIMIT 1`,
        [id, actorId]
      );

      const document = result.rows[0];

      if (!document) {
        await writeAudit({
          actorId,
          action: "document_preview",
          documentId: id,
          outcome: "denied",
          details: { reason: "Document not found or access denied" }
        });

        return res.status(404).json({
          error: "Document not found or access denied"
        });
      }

      // Check if document encryption key is revoked
      if (document.key_id) {
        const keyCheck = await pool.query(
          "SELECT status FROM encryption_keys WHERE id = $1",
          [document.key_id]
        );
        if (keyCheck.rows[0]?.status === "revoked") {
          await writeAudit({
            actorId,
            action: "key_release",
            documentId: document.id,
            outcome: "denied",
            details: { reason: "Document encryption key has been revoked" }
          });

          return res.status(403).json({
            error: "Document encryption key has been revoked"
          });
        }
      }

      // Access key / timer verification for non-owners
      if (document.owner_id !== actorId && document.secret_key_hash) {
        if (!document.unlocked_at) {
          await writeAudit({
            actorId,
            action: "document_preview",
            documentId: document.id,
            outcome: "denied",
            details: { reason: "Document is locked with an access key" }
          });

          return res.status(403).json({
            error: "Document is locked with an access key / secret key. Please enter the required key to view.",
            locked: true
          });
        }

        if (document.timer_enabled && document.unlocked_at) {
          const elapsedMinutes = (Date.now() - new Date(document.unlocked_at).getTime()) / 60000;
          if (elapsedMinutes > Number(document.timer_duration_minutes || 5)) {
            await writeAudit({
              actorId,
              action: "document_preview",
              documentId: document.id,
              outcome: "denied",
              details: { reason: "Document access timer expired" }
            });

            return res.status(403).json({
              error: "Document access timer has expired. Please enter the access key again.",
              expired: true
            });
          }
        }
      }

      let envelope;
      try {
        envelope = await readEncryptedFile(document.storage_key);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== 404 && error.status !== 404) throw error;

        await writeAudit({
          actorId,
          action: "document_preview",
          documentId: document.id,
          outcome: "failure",
          details: { reason: "Stored file missing" }
        });

        return res.status(404).json({
          error: "File not found"
        });
      }

      const parsed = parseEnvelope(envelope);
      let dekHex;
      let ivHex;
      let authTagHex;
      let ciphertextBase64;

      if (parsed.version === 2 && document.wrapped_dek) {
        const keyObj = await getManagedKeyBytes(pool, document.key_id);
        const dek = unwrapKey(document.wrapped_dek, keyObj.keyBytes);
        dekHex = dek.toString("hex");
        ivHex = parsed.ivHex;
        authTagHex = parsed.authTagHex;
        ciphertextBase64 = parsed.ciphertext.toString("base64");
      } else {
        // TVE1 legacy document backward compatibility
        dekHex = getMasterKek().toString("hex");
        ivHex = parsed.ivHex;
        authTagHex = parsed.authTagHex;
        ciphertextBase64 = parsed.ciphertext.toString("base64");
      }

      // Record authorized key release audit event
      await writeAudit({
        actorId,
        action: "key_release",
        documentId: document.id,
        outcome: "success",
        details: {
          encryptionVersion: parsed.version,
          keyId: document.key_id || "KEY-DEFAULT-01",
          viewMode: "client_side_decryption"
        }
      });

      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0"
      });

      return res.status(200).json({
        id: document.id,
        name: document.name,
        mimeType: document.mime_type,
        sizeBytes: document.size_bytes,
        encryptionVersion: parsed.version,
        keyId: document.key_id || "KEY-DEFAULT-01",
        iv: ivHex,
        authTag: authTagHex,
        ciphertext: ciphertextBase64,
        dek: dekHex
      });
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// Unlock document with secret key / passphrase
// --------------------------------------------------
// Unlock document with secret key / start access timer
// --------------------------------------------------

app.post(
  "/api/documents/:id/unlock",
  requireAuth,
  unlockLimiter,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { secretKey } = req.body || {};
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        return res.status(404).json({ error: "Document not found" });
      }

      const document = await findAccessibleDocument(id, actorId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      const durationMinutes = document.timer_duration_minutes || 5;

      if (!document.secret_key_hash) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
        await pool.query("UPDATE documents SET unlocked_at = $1 WHERE id = $2", [now, document.id]);
        return res.json({
          success: true,
          unlocked: true,
          unlocked_at: now.toISOString(),
          document: {
            ...document,
            unlocked_at: now.toISOString(),
            expires_at: expiresAt.toISOString()
          },
          timer_duration_minutes: durationMinutes,
          auto_delete: document.auto_delete !== false,
          expires_at: expiresAt.toISOString()
        });
      }

      if (!secretKey || typeof secretKey !== "string") {
        return res.status(400).json({ error: "Secret key is required" });
      }

      const inputHash = crypto.createHash("sha256").update(secretKey.trim()).digest("hex");
      if (inputHash !== document.secret_key_hash) {
        await writeAudit({
          actorId,
          action: "document_unlock",
          documentId: document.id,
          outcome: "denied",
          details: { reason: "Invalid secret key entered" }
        });

        return res.status(400).json({ error: "Invalid secret key" });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      await pool.query(
        "UPDATE documents SET unlocked_at = $1 WHERE id = $2",
        [now, document.id]
      );

      await writeAudit({
        actorId,
        action: "document_unlock",
        documentId: document.id,
        outcome: "success",
        details: {
          unlockedAt: now.toISOString(),
          timer_duration_minutes: durationMinutes,
          auto_delete: document.auto_delete !== false,
          expires_at: expiresAt.toISOString()
        }
      });

      return res.json({
        success: true,
        unlocked: true,
        unlocked_at: now.toISOString(),
        document: {
          ...document,
          unlocked_at: now.toISOString(),
          expires_at: expiresAt.toISOString()
        },
        timer_duration_minutes: durationMinutes,
        auto_delete: document.auto_delete !== false,
        expires_at: expiresAt.toISOString()
      });
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// List eligible users for permission grant (Owner/Admin)
// --------------------------------------------------

app.get(
  "/api/users/eligible",
  requireAuth,
  async (req, res, next) => {
    try {
      const actorId = req.session.user.id;
      const { search = "", role = "", exact = "false" } = req.query;
      const isExact = exact === "true" || exact === true;

      let query = `
        SELECT id, name, email, role, created_at,
               ('TV-USR-00' || id) AS unique_id
        FROM users
        WHERE id != $1
      `;
      const params = [actorId];

      if (role && role !== "all") {
        params.push(role.toLowerCase());
        query += ` AND role = $${params.length}`;
      }

      if (search && search.trim()) {
        const q = search.trim();
        if (isExact) {
          params.push(q.toLowerCase());
          query += ` AND (LOWER(email) = $${params.length} OR LOWER('TV-USR-00' || id) = $${params.length} OR ('#' || id) = $${params.length} OR CAST(id AS TEXT) = $${params.length})`;
        } else {
          params.push(`%${q}%`);
          query += ` AND (email ILIKE $${params.length} OR name ILIKE $${params.length} OR ('TV-USR-00' || id) ILIKE $${params.length} OR CAST(id AS TEXT) ILIKE $${params.length})`;
        }
      }

      query += ` ORDER BY id ASC LIMIT 50`;

      const result = await pool.query(query, params);
      return res.json({ users: result.rows });
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// List document permissions (owner only)
// --------------------------------------------------

app.get(
  "/api/documents/:id/permissions",
  requireAuth,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId,
          action: "permission_read",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      const docResult = await pool.query(
        "SELECT id, owner_id FROM documents WHERE id = $1 LIMIT 1",
        [id]
      );

      const document = docResult.rows[0];

      if (!document || String(document.owner_id) !== String(actorId)) {
        await writeAudit({
          actorId,
          action: "permission_read",
          documentId: id,
          outcome: "denied",
          details: { reason: "Only the owner can view permissions" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      const permissions = await pool.query(
        `SELECT dp.id, dp.document_id, dp.user_id, dp.permission, dp.created_at,
                u.name AS user_name, u.email AS user_email,
                ('TV-USR-00' || dp.user_id) AS unique_id
         FROM document_permissions dp
         JOIN users u ON u.id = dp.user_id
         WHERE dp.document_id = $1
         ORDER BY dp.created_at ASC`,
        [id]
      );

      await writeAudit({
        actorId,
        action: "permission_read",
        documentId: id,
        outcome: "success"
      });

      return res.json({
        permissions: permissions.rows
      });
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// Grant permission (owner only, with atomic lock)
// --------------------------------------------------

app.post(
  ["/api/documents/:id/permissions", "/api/documents/:id/access"],
  requireAuth,
  async (req, res, next) => {
    let client;

    try {
      const { id } = req.params;
      const { email, userId, viewerId, uniqueId, permission } = req.body || {};
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId,
          action: "permission_grant",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      const hasEmail = email && validEmail(email);
      let parsedUserId = userId ? Number(userId) : viewerId ? Number(viewerId) : null;
      if (!parsedUserId && uniqueId) {
        const cleaned = String(uniqueId).replace(/^tv-usr-0*/i, "").replace(/^#/, "");
        if (/^\d+$/.test(cleaned)) {
          parsedUserId = Number(cleaned);
        }
      }

      if ((!hasEmail && !parsedUserId) || !ALLOWED_PERMISSIONS.has(permission)) {
        await writeAudit({
          actorId,
          action: "permission_grant",
          documentId: id,
          outcome: "failure",
          details: { reason: "Invalid email, uniqueId, or permission parameter" }
        });

        return res.status(400).json({
          error: "Valid email or unique ID, and permission ('read' or 'edit') are required"
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      const documentResult = await client.query(
        "SELECT id, owner_id FROM documents WHERE id = $1 FOR UPDATE",
        [id]
      );

      const document = documentResult.rows[0];

      if (
        !document ||
        (String(document.owner_id) !== String(actorId) && req.session.user.role !== "admin")
      ) {
        await client.query("ROLLBACK");

        await writeAudit({
          actorId,
          action: "permission_grant",
          documentId: id,
          outcome: "denied",
          details: {
            reason: "Only the owner or administrator can grant permissions"
          }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      let targetResult;
      if (hasEmail) {
        targetResult = await client.query(
          "SELECT id, email FROM users WHERE email = $1 LIMIT 1",
          [email.trim().toLowerCase()]
        );
      } else {
        targetResult = await client.query(
          "SELECT id, email FROM users WHERE id = $1 LIMIT 1",
          [parsedUserId]
        );
      }

      const target = targetResult.rows[0];

      if (!target) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Target user not found"
        });
      }

      if (String(target.id) === String(actorId)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "You already own this document"
        });
      }

      await client.query(
        `INSERT INTO document_permissions
           (document_id, user_id, permission, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (document_id, user_id)
         DO UPDATE SET
           permission = EXCLUDED.permission,
           granted_by = EXCLUDED.granted_by,
           created_at = NOW()`,
        [id, target.id, permission, actorId]
      );

      await writeAudit({
        actorId,
        action: "permission_grant",
        documentId: id,
        targetUserId: target.id,
        outcome: "success",
        details: { permission },
        db: client
      });

      await client.query("COMMIT");

      return res.json({
        message: "Permission granted successfully",
        permission: {
          document_id: Number(id),
          user_id: target.id,
          email: target.email,
          permission
        }
      });
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackError) {}
      }
      return next(error);
    } finally {
      if (client) client.release();
    }
  }
);

// --------------------------------------------------
// Revoke permission (owner only, with atomic lock)
// --------------------------------------------------

app.delete(
  ["/api/documents/:id/permissions/:userId", "/api/documents/:id/access/:userId", "/api/documents/:id/access/:viewerId"],
  requireAuth,
  async (req, res, next) => {
    let client;

    try {
      const { id } = req.params;
      const targetUserId = req.params.userId || req.params.viewerId;
      const actorId = req.session.user.id;

      if (!validDocumentId(id) || !validUserId(targetUserId)) {
        await writeAudit({
          actorId,
          action: "permission_revoke",
          outcome: "denied",
          details: { reason: "Invalid document ID or user ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      const documentResult = await client.query(
        "SELECT id, owner_id FROM documents WHERE id = $1 FOR UPDATE",
        [id]
      );

      const document = documentResult.rows[0];

      if (
        !document ||
        (String(document.owner_id) !== String(actorId) && req.session.user.role !== "admin")
      ) {
        await client.query("ROLLBACK");

        await writeAudit({
          actorId,
          action: "permission_revoke",
          documentId: id,
          targetUserId: targetUserId,
          outcome: "denied",
          details: {
            reason: "Only the owner or administrator can revoke permissions"
          }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      const deleted = await client.query(
        `DELETE FROM document_permissions
         WHERE document_id = $1 AND user_id = $2
         RETURNING user_id`,
        [id, targetUserId]
      );

      if (deleted.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Permission not found"
        });
      }

      await writeAudit({
        actorId,
        action: "permission_revoke",
        documentId: id,
        targetUserId: targetUserId,
        outcome: "success",
        db: client
      });

      await client.query("COMMIT");

      return res.json({
        message: "Permission revoked"
      });
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackError) {}
      }
      return next(error);
    } finally {
      if (client) client.release();
    }
  }
);

// --------------------------------------------------
// Delete document (owner only)
// --------------------------------------------------

app.delete(
  "/api/documents/:id",
  requireAuth,
  async (req, res, next) => {
    let client;
    let storageKey;
    let transactionStarted = false;

    try {
      const { id } = req.params;
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId,
          action: "document_delete",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
        `SELECT id, storage_key, owner_id, timer_enabled, auto_delete
         FROM documents
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      const doc = result.rows[0];
      const isOwner = doc && String(doc.owner_id) === String(actorId);
      const isAutoDeleteEligible = doc && doc.timer_enabled && doc.auto_delete;

      if (!doc || (!isOwner && !isAutoDeleteEligible)) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        await writeAudit({
          actorId,
          action: "document_delete",
          documentId: id,
          outcome: "denied",
          details: {
            reason: "Document missing or owner access required"
          }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      storageKey = doc.storage_key;

      await client.query(
        "DELETE FROM document_permissions WHERE document_id = $1",
        [id]
      );

      await client.query(
        "DELETE FROM documents WHERE id = $1",
        [id]
      );

      await writeAudit({
        actorId,
        action: "document_delete",
        documentId: id,
        outcome: "success",
        details: {
          storageKeyRemovedAfterCommit: true,
          autoDelete: !isOwner && isAutoDeleteEligible
        },
        db: client
      });

      await client.query("COMMIT");
      transactionStarted = false;

      await removeStoredFile(storageKey);

      return res.json({
        message: "Document deleted successfully"
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackError) {
          // Preserve the original error.
        }
      }
      return next(error);
    } finally {
      if (client) client.release();
    }
  }
);



// --------------------------------------------------
// Admin audit logs (with advanced filtering and pagination)
// Query parameters: action, outcome, actorId, documentId, from, to, limit, offset
// --------------------------------------------------

app.get(
  "/api/admin/audit-logs",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const {
        action,
        outcome,
        actorId,
        documentId,
        from,
        to,
        limit: reqLimit,
        offset: reqOffset
      } = req.query;

      const conditions = [];
      const values = [];

      function addCondition(sql, value) {
        values.push(value);
        conditions.push(sql.replace("?", `$${values.length}`));
      }

      if (typeof action === "string" && action.trim()) {
        addCondition("a.action = ?", action.trim().slice(0, 50));
      }

      if (
        typeof outcome === "string" &&
        ALLOWED_AUDIT_OUTCOMES.has(outcome.trim().toLowerCase())
      ) {
        addCondition("a.outcome = ?", outcome.trim().toLowerCase());
      }

      if (validUserId(actorId)) {
        addCondition("a.actor_id = ?", actorId);
      }

      if (validDocumentId(documentId)) {
        addCondition("a.document_id = ?", documentId);
      }

      if (typeof from === "string" && from.trim()) {
        if (!isValidCalendarDate(from)) {
          return res.status(400).json({
            error: "Invalid from date"
          });
        }
        addCondition("a.created_at >= ?::date", from.trim());
      }

      if (typeof to === "string" && to.trim()) {
        if (!isValidCalendarDate(to)) {
          return res.status(400).json({
            error: "Invalid to date"
          });
        }
        addCondition("a.created_at < (?::date + INTERVAL '1 day')", to.trim());
      }

      if (
        typeof from === "string" &&
        typeof to === "string" &&
        from.trim() &&
        to.trim() &&
        from.trim() > to.trim()
      ) {
        return res.status(400).json({
          error: "Invalid date range: 'from' must be before or equal to 'to'"
        });
      }

      const requestedLimit = Number(reqLimit || 100);
      const limit = Number.isInteger(requestedLimit)
        ? Math.max(1, Math.min(requestedLimit, 200))
        : 100;

      const requestedOffset = Number(reqOffset || 0);
      const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

      values.push(limit);
      const limitParam = `$${values.length}`;

      values.push(offset);
      const offsetParam = `$${values.length}`;

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await pool.query(
        `SELECT a.id, a.actor_id, a.action, a.document_id, a.target_user_id,
                a.outcome, a.details, a.created_at,
                u.name AS actor_name, u.email AS actor_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ${whereClause}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values
      );

      await writeAudit({
        actorId: req.session.user.id,
        action: "admin_audit_logs_read",
        outcome: "success",
        details: { limit, offset }
      });

      return res.json({
        auditLogs: result.rows
      });
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// Admin Management APIs
// --------------------------------------------------

// Admin Overview Stats
app.get("/api/admin/stats", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const usersResult = await pool.query("SELECT role, status FROM users");
    const docsCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM documents");
    const complaintsResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM complaints WHERE status IN ('Submitted', 'In Review')"
    );
    const recentUploadsResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM documents WHERE created_at >= NOW() - INTERVAL '30 days'"
    );
    const accessDeniedResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_logs WHERE outcome = 'denied'"
    );
    const securityEventsResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_logs"
    );

    const roleCounts = { admin: 0, owner: 0, viewer: 0 };
    let pendingApprovalsCount = 0;

    for (const row of usersResult.rows) {
      if (roleCounts[row.role] !== undefined) {
        roleCounts[row.role]++;
      }
      if (row.role === "owner" && row.status === "pending") {
        pendingApprovalsCount++;
      }
    }

    const accessDeniedCount = accessDeniedResult.rows[0]?.count || 0;

    return res.json({
      stats: {
        totalAccounts: usersResult.rows.length,
        roleCounts,
        pendingApprovalsCount,
        pendingComplaintsCount: complaintsResult.rows[0]?.count || 0,
        totalDocuments: docsCountResult.rows[0]?.count || 0,
        recentUploadsCount: recentUploadsResult.rows[0]?.count || 0,
        accessDeniedCount,
        securityEventsCount: securityEventsResult.rows[0]?.count || 0,
        activeSecurityAlerts: accessDeniedCount > 0 ? accessDeniedCount : 0
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Admin User List & Search
app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { search, role, status, limit: reqLimit, offset: reqOffset } = req.query;
    const conditions = [];
    const values = [];

    function addFilter(sql, val) {
      values.push(val);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    if (typeof search === "string" && search.trim()) {
      const q = `%${escapeLike(search.trim().slice(0, 100))}%`;
      values.push(q);
      conditions.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR ('TV-USR-00' || u.id) ILIKE $${values.length})`);
    }

    if (typeof role === "string" && role !== "all" && ["admin", "owner", "viewer"].includes(role.toLowerCase())) {
      addFilter("u.role = ?", role.toLowerCase());
    }

    if (typeof status === "string" && status !== "all" && ["active", "pending", "suspended", "rejected"].includes(status.toLowerCase())) {
      addFilter("u.status = ?", status.toLowerCase());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = Math.min(Math.max(1, Number(reqLimit || 50)), 200);
    const offset = Math.max(0, Number(reqOffset || 0));

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`,
      values
    );

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.status, u.mobile, u.avatar_url,
             u.created_at, u.last_login, u.terms_accepted_at,
             ('TV-USR-00' || u.id) AS unique_id
      FROM users u
      ${whereClause}
      ORDER BY u.id ASC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, values);

    return res.json({
      users: result.rows,
      total: countRes.rows[0]?.total || 0
    });
  } catch (error) {
    return next(error);
  }
});

// Admin User Status Modification (Approval / Suspension)
app.patch("/api/admin/users/:id/status", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body || {};
    const validStatuses = new Set(["active", "inactive", "pending", "suspended", "rejected"]);

    if (!validUserId(id)) {
      return res.status(404).json({ error: "Invalid user ID" });
    }

    if (String(id) === String(req.session.user.id)) {
      return res.status(400).json({ error: "Administrators cannot alter their own account status" });
    }

    if (!status || !validStatuses.has(String(status).toLowerCase())) {
      return res.status(400).json({ error: "Valid status ('active', 'inactive', 'pending', 'suspended', 'rejected') required" });
    }

    const newStatus = String(status).toLowerCase();
    const result = await pool.query(
      "UPDATE users SET status = $1 WHERE id = $2 RETURNING id, email, role, status",
      [newStatus, id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    // Invalidate active sessions if account inactive, suspended, or rejected
    if (newStatus === "inactive" || newStatus === "suspended" || newStatus === "rejected") {
      try {
        await pool.query(
          "DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text",
          [String(id)]
        );
      } catch (_sessErr) {}
    }

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_user_status_update",
      targetUserId: id,
      outcome: "success",
      details: { newStatus, reason: reason || "" }
    });

    return res.json({
      success: true,
      userId: Number(id),
      status: newStatus,
      user: {
        id: Number(id),
        status: newStatus
      },
      reason: reason || ""
    });
  } catch (error) {
    return next(error);
  }
});

// ==================================================
// Master Data Management APIs (Admin & Owner Scope)
// ==================================================

// --------------------------------------------------
// 1. Admin APIs — Owner Master Data
// --------------------------------------------------

// List Owners (Admin only)
app.get("/api/admin/owners", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const {
      search = "",
      status = "all",
      approvalState = "all",
      sortBy = "created_at",
      sortDir = "desc",
      page = 1,
      limit = 10
    } = req.query;

    const conditions = ["u.role = 'owner'"];
    const values = [];

    function addFilter(sql, val) {
      values.push(val);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    if (typeof search === "string" && search.trim()) {
      const q = `%${escapeLike(search.trim().slice(0, 100))}%`;
      values.push(q);
      conditions.push(
        `(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR COALESCE(u.mobile, '') ILIKE $${values.length} OR COALESCE(u.department, '') ILIKE $${values.length} OR COALESCE(u.unique_id, '') ILIKE $${values.length})`
      );
    }

    if (typeof status === "string" && status !== "all") {
      const cleanStatus = status.toLowerCase().trim();
      if (["active", "inactive", "pending", "suspended", "rejected"].includes(cleanStatus)) {
        addFilter("u.status = ?", cleanStatus);
      }
    }

    if (typeof approvalState === "string" && approvalState !== "all") {
      const cleanApproval = approvalState.toLowerCase().trim();
      if (["approved", "pending", "rejected"].includes(cleanApproval)) {
        addFilter("u.approval_state = ?", cleanApproval);
      }
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`,
      values
    );
    const total = countRes.rows[0]?.total || 0;

    const allowedSort = {
      name: "u.name",
      email: "u.email",
      created_at: "u.created_at",
      status: "u.status",
      department: "u.department",
      approval_state: "u.approval_state",
      documents_count: "documents_count",
      viewers_count: "viewers_count"
    };

    const sortCol = allowedSort[sortBy] || "u.created_at";
    const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    values.push(parsedLimit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const query = `
      SELECT u.id, u.name, u.email, u.role, u.mobile, u.department, u.status,
             COALESCE(u.approval_state, CASE WHEN u.status = 'pending' THEN 'pending' ELSE 'approved' END) AS approval_state,
             u.created_at, u.last_login,
             COALESCE(u.unique_id, 'TV-OWN-' || LPAD(u.id::text, 4, '0')) AS unique_id,
             COALESCE(u.created_by, 1) AS created_by,
             (SELECT COUNT(*)::int FROM documents d WHERE d.owner_id = u.id) AS documents_count,
             (SELECT COUNT(*)::int FROM users v WHERE v.role = 'viewer' AND v.owner_id = u.id) AS viewers_count
      FROM users u
      ${whereClause}
      ORDER BY ${sortCol} ${direction}, u.id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const result = await pool.query(query, values);

    return res.json({
      owners: result.rows,
      total,
      page: parsedPage,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit))
    });
  } catch (error) {
    return next(error);
  }
});

// View Owner details (Admin only)
app.get("/api/admin/owners/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validUserId(id)) {
      return res.status(404).json({ error: "Owner not found" });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.mobile, u.department, u.status,
             COALESCE(u.approval_state, CASE WHEN u.status = 'pending' THEN 'pending' ELSE 'approved' END) AS approval_state,
             u.created_at, u.updated_at, u.last_login,
             COALESCE(u.unique_id, 'TV-OWN-' || LPAD(u.id::text, 4, '0')) AS unique_id,
             u.created_by,
             (SELECT COUNT(*)::int FROM documents d WHERE d.owner_id = u.id) AS documents_count,
             (SELECT COUNT(*)::int FROM users v WHERE v.role = 'viewer' AND v.owner_id = u.id) AS viewers_count
      FROM users u
      WHERE u.id = $1 AND u.role = 'owner'
      LIMIT 1
    `, [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Owner not found" });
    }

    return res.json({ owner: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

// Create Owner (Admin only)
app.post("/api/admin/owners", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, email, mobile, department, status, approval_state } = req.body || {};

    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: "Valid owner name is required (max 100 characters)" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Valid corporate email address is required" });
    }

    if (mobile && !isValidPhone(mobile)) {
      return res.status(400).json({ error: "Invalid mobile phone number format" });
    }

    const normEmail = email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [normEmail]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: `An account with email '${normEmail}' already exists.` });
    }

    const initialStatus = ["active", "inactive", "pending", "suspended", "rejected"].includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : "active";

    const initialApproval = ["approved", "pending", "rejected"].includes(String(approval_state).toLowerCase())
      ? String(approval_state).toLowerCase()
      : initialStatus === "pending" ? "pending" : "approved";

    const sanitizedDept = sanitizeFormulaInjection((department || "General Operations").trim().slice(0, 100));
    const sanitizedMobile = mobile ? sanitizeFormulaInjection(mobile.trim().slice(0, 25)) : null;
    const sanitizedName = sanitizeFormulaInjection(name.trim().slice(0, 100));

    // Generate secure random provisioning password hash
    const randomSecret = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomSecret, 12);

    const insertResult = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, status, approval_state, mobile, department, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, 'owner', $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, name, email, role, status, approval_state, mobile, department, created_by, created_at, updated_at
    `, [
      sanitizedName,
      normEmail,
      passwordHash,
      initialStatus,
      initialApproval,
      sanitizedMobile,
      sanitizedDept,
      req.session.user.id
    ]);

    const newOwner = insertResult.rows[0];
    const uniqueId = generateUniqueId("owner", newOwner.id);

    await pool.query("UPDATE users SET unique_id = $1 WHERE id = $2", [uniqueId, newOwner.id]);
    newOwner.unique_id = uniqueId;
    newOwner.documents_count = 0;
    newOwner.viewers_count = 0;

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_create_owner",
      targetUserId: newOwner.id,
      outcome: "success",
      details: { email: newOwner.email, department: newOwner.department, status: newOwner.status }
    });

    return res.status(201).json({
      success: true,
      owner: newOwner
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return next(error);
  }
});

// Update Owner details (Admin only)
app.patch("/api/admin/owners/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validUserId(id)) {
      return res.status(404).json({ error: "Owner not found" });
    }

    if (req.body.role && req.body.role.toLowerCase() !== "owner") {
      return res.status(400).json({ error: "Role cannot be altered via master data update" });
    }

    const existingResult = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'owner' LIMIT 1", [id]);
    if (!existingResult.rows[0]) {
      return res.status(404).json({ error: "Owner not found" });
    }
    const current = existingResult.rows[0];

    const { name, email, mobile, department, status, approval_state } = req.body || {};

    let updatedName = current.name;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ error: "Valid owner name is required" });
      }
      updatedName = sanitizeFormulaInjection(name.trim().slice(0, 100));
    }

    let updatedEmail = current.email;
    if (email !== undefined) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Valid corporate email is required" });
      }
      const norm = email.trim().toLowerCase();
      if (norm !== current.email.toLowerCase()) {
        const dupCheck = await pool.query("SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1", [norm, id]);
        if (dupCheck.rows[0]) {
          return res.status(409).json({ error: `An account with email '${norm}' already exists.` });
        }
        updatedEmail = norm;
      }
    }

    let updatedMobile = current.mobile;
    if (mobile !== undefined) {
      if (mobile && !isValidPhone(mobile)) {
        return res.status(400).json({ error: "Invalid mobile phone number format" });
      }
      updatedMobile = mobile ? sanitizeFormulaInjection(mobile.trim().slice(0, 25)) : null;
    }

    let updatedDept = current.department;
    if (department !== undefined) {
      updatedDept = sanitizeFormulaInjection(String(department).trim().slice(0, 100));
    }

    let updatedStatus = current.status;
    if (status !== undefined) {
      const s = String(status).toLowerCase().trim();
      if (["active", "inactive", "pending", "suspended", "rejected"].includes(s)) {
        updatedStatus = s;
      }
    }

    let updatedApproval = current.approval_state || (updatedStatus === "pending" ? "pending" : "approved");
    if (approval_state !== undefined) {
      const a = String(approval_state).toLowerCase().trim();
      if (["approved", "pending", "rejected"].includes(a)) {
        updatedApproval = a;
      }
    }

    const updateResult = await pool.query(`
      UPDATE users
      SET name = $1, email = $2, mobile = $3, department = $4, status = $5, approval_state = $6, updated_at = NOW()
      WHERE id = $7 AND role = 'owner'
      RETURNING id, name, email, role, status, approval_state, mobile, department, created_by, created_at, updated_at, unique_id
    `, [updatedName, updatedEmail, updatedMobile, updatedDept, updatedStatus, updatedApproval, id]);

    const updated = updateResult.rows[0];

    // Invalidate active sessions if status changed to inactive, suspended, or rejected
    if (updatedStatus === "inactive" || updatedStatus === "suspended" || updatedStatus === "rejected") {
      try {
        await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text", [String(id)]);
      } catch (_sessErr) {}
    }

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_update_owner",
      targetUserId: id,
      outcome: "success",
      details: { updatedFields: Object.keys(req.body) }
    });

    return res.json({
      success: true,
      owner: updated
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return next(error);
  }
});

// Toggle Owner Status (Admin only)
app.patch("/api/admin/owners/:id/status", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body || {};

    if (!validUserId(id)) {
      return res.status(404).json({ error: "Owner not found" });
    }

    if (String(id) === String(req.session.user.id)) {
      return res.status(400).json({ error: "Administrators cannot alter their own account status" });
    }

    const validStatuses = new Set(["active", "inactive", "pending", "suspended", "rejected"]);
    if (!status || !validStatuses.has(String(status).toLowerCase())) {
      return res.status(400).json({ error: "Valid status ('active', 'inactive', 'pending', 'suspended', 'rejected') is required" });
    }

    const newStatus = String(status).toLowerCase();
    const newApproval = newStatus === "rejected" || newStatus === "inactive"
      ? "rejected"
      : newStatus === "pending"
      ? "pending"
      : "approved";

    const result = await pool.query(`
      UPDATE users
      SET status = $1, approval_state = $2, updated_at = NOW()
      WHERE id = $3 AND role = 'owner'
      RETURNING id, name, email, role, status, approval_state, unique_id
    `, [newStatus, newApproval, id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Owner not found" });
    }

    if (newStatus === "inactive" || newStatus === "suspended" || newStatus === "rejected") {
      try {
        await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text", [String(id)]);
      } catch (_sessErr) {}
    }

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_owner_status_update",
      targetUserId: id,
      outcome: "success",
      details: { newStatus, reason: reason || "" }
    });

    return res.json({
      success: true,
      owner: result.rows[0],
      status: newStatus,
      reason: reason || ""
    });
  } catch (error) {
    return next(error);
  }
});

// Import Owners from CSV / Spreadsheet (Admin only)
app.post("/api/admin/owners/import", requireAuth, requireAdmin, uploadImport.single("file"), async (req, res, next) => {
  try {
    let rows = [];

    if (req.file) {
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "Import file exceeds the 5 MB limit" });
      }
      const rawText = req.file.buffer.toString("utf8");
      rows = parseCsv(rawText);
    } else if (Array.isArray(req.body.rows)) {
      rows = req.body.rows.map((r, i) => {
        const item = { ...r, _rowNum: i + 1 };
        normalizeRowAliases(item);
        return item;
      });
    } else if (typeof req.body.csvText === "string") {
      rows = parseCsv(req.body.csvText);
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "No valid rows found in import data." });
    }

    const emailsToCheck = rows
      .map((r) => (r.email || "").trim().toLowerCase())
      .filter(Boolean);

    let existingEmailSet = new Set();
    if (emailsToCheck.length > 0) {
      const existingRes = await pool.query(
        "SELECT email FROM users WHERE email = ANY($1::text[])",
        [emailsToCheck]
      );
      existingEmailSet = new Set(existingRes.rows.map((row) => row.email.toLowerCase()));
    }

    const seenInFile = new Set();
    const validRows = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const rowNum = row._rowNum || idx + 1;
      const rawEmail = (row.email || "").trim();
      const rawName = (row.name || "").trim();
      const normEmail = rawEmail.toLowerCase();

      if (!rawEmail) {
        errors.push({ row: rowNum, error: "Missing required email address." });
        return;
      }

      if (!isValidEmail(rawEmail)) {
        errors.push({ row: rowNum, email: rawEmail, error: "Invalid email format." });
        return;
      }

      if (!rawName) {
        errors.push({ row: rowNum, email: rawEmail, error: "Missing required owner name." });
        return;
      }

      if (rawName.length > 100) {
        errors.push({ row: rowNum, email: rawEmail, error: "Owner name exceeds 100 characters." });
        return;
      }

      if (row.mobile && !isValidPhone(row.mobile)) {
        errors.push({ row: rowNum, email: rawEmail, error: "Invalid mobile phone format." });
        return;
      }

      if (seenInFile.has(normEmail)) {
        errors.push({ row: rowNum, email: rawEmail, error: `Duplicate email '${rawEmail}' within import file.` });
        return;
      }

      if (existingEmailSet.has(normEmail)) {
        errors.push({ row: rowNum, email: rawEmail, error: `Email '${rawEmail}' is already registered in TrustVault.` });
        return;
      }

      seenInFile.add(normEmail);

      const status = row.status === "inactive" ? "inactive" : row.status === "pending" ? "pending" : "active";
      const approval_state = row.approval_state === "pending" ? "pending" : "approved";

      validRows.push({
        name: sanitizeFormulaInjection(rawName),
        email: normEmail,
        mobile: row.mobile ? sanitizeFormulaInjection(String(row.mobile).trim().slice(0, 25)) : null,
        department: sanitizeFormulaInjection((row.department || "Operations").trim().slice(0, 100)),
        status,
        approval_state
      });
    });

    if (validRows.length === 0) {
      return res.status(400).json({
        success: false,
        addedCount: 0,
        errors,
        importedOwners: []
      });
    }

    const client = await pool.connect();
    const importedOwners = [];

    try {
      await client.query("BEGIN");

      for (const item of validRows) {
        const randPass = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randPass, 10);

        const insRes = await client.query(`
          INSERT INTO users (name, email, password_hash, role, status, approval_state, mobile, department, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, 'owner', $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING id, name, email, role, status, approval_state, mobile, department, created_by, created_at, updated_at
        `, [
          item.name,
          item.email,
          passwordHash,
          item.status,
          item.approval_state,
          item.mobile,
          item.department,
          req.session.user.id
        ]);

        const owner = insRes.rows[0];
        const uniqueId = generateUniqueId("owner", owner.id);
        await client.query("UPDATE users SET unique_id = $1 WHERE id = $2", [uniqueId, owner.id]);
        owner.unique_id = uniqueId;
        owner.documents_count = 0;
        owner.viewers_count = 0;

        importedOwners.push(owner);
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_import_owners",
      outcome: "success",
      details: { addedCount: importedOwners.length, errorCount: errors.length }
    });

    return res.status(201).json({
      success: true,
      addedCount: importedOwners.length,
      errors,
      importedOwners
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// 2. Owner APIs — Viewer Master Data
// --------------------------------------------------

// List Viewers (Owner scope with strict tenant isolation)
app.get("/api/owner/viewers", requireAuth, requireOwner, async (req, res, next) => {
  try {
    const ownerId = req.session.user.id;
    const {
      search = "",
      status = "all",
      accessState = "all",
      sortBy = "created_at",
      sortDir = "desc",
      page = 1,
      limit = 10
    } = req.query;

    const conditions = ["u.role = 'viewer'", "u.owner_id = $1"];
    const values = [ownerId];

    function addFilter(sql, val) {
      values.push(val);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    if (typeof search === "string" && search.trim()) {
      const q = `%${escapeLike(search.trim().slice(0, 100))}%`;
      values.push(q);
      conditions.push(
        `(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length} OR COALESCE(u.mobile, '') ILIKE $${values.length} OR COALESCE(u.department, '') ILIKE $${values.length} OR COALESCE(u.unique_id, '') ILIKE $${values.length})`
      );
    }

    if (typeof status === "string" && status !== "all") {
      const s = status.toLowerCase().trim();
      if (["active", "inactive", "pending", "suspended", "rejected"].includes(s)) {
        addFilter("u.status = ?", s);
      }
    }

    if (typeof accessState === "string" && accessState !== "all") {
      const a = accessState.toLowerCase().trim();
      if (["granted", "restricted", "revoked"].includes(a)) {
        addFilter("u.access_state = ?", a);
      }
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`,
      values
    );
    const total = countRes.rows[0]?.total || 0;

    const allowedSort = {
      name: "u.name",
      email: "u.email",
      created_at: "u.created_at",
      status: "u.status",
      department: "u.department",
      access_state: "u.access_state"
    };

    const sortCol = allowedSort[sortBy] || "u.created_at";
    const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    values.push(parsedLimit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const query = `
      SELECT u.id, u.owner_id, u.name, u.email, u.role, u.mobile, u.department, u.status,
             COALESCE(u.access_state, CASE WHEN u.status = 'inactive' THEN 'restricted' WHEN u.status = 'suspended' THEN 'revoked' ELSE 'granted' END) AS access_state,
             u.created_at, u.last_login,
             COALESCE(u.unique_id, 'TV-VIW-' || LPAD(u.id::text, 4, '0')) AS unique_id,
             COALESCE(
               (
                 SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'category', d.category))
                 FROM document_permissions dp
                 JOIN documents d ON d.id = dp.document_id
                 WHERE dp.user_id = u.id AND d.owner_id = $1
               ),
               '[]'::json
             ) AS assigned_documents
      FROM users u
      ${whereClause}
      ORDER BY ${sortCol} ${direction}, u.id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const result = await pool.query(query, values);

    return res.json({
      viewers: result.rows,
      total,
      page: parsedPage,
      totalPages: Math.max(1, Math.ceil(total / parsedLimit))
    });
  } catch (error) {
    return next(error);
  }
});

// View Viewer details (Strict tenant isolation)
app.get("/api/owner/viewers/:id", requireAuth, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.session.user.id;

    if (!validUserId(id)) {
      return res.status(404).json({ error: "Viewer not found" });
    }

    // Strict tenant isolation: must match id, role='viewer', AND owner_id=ownerId
    const result = await pool.query(`
      SELECT u.id, u.owner_id, u.name, u.email, u.mobile, u.department, u.status,
             COALESCE(u.access_state, CASE WHEN u.status = 'inactive' THEN 'restricted' WHEN u.status = 'suspended' THEN 'revoked' ELSE 'granted' END) AS access_state,
             u.created_at, u.updated_at, u.last_login,
             COALESCE(u.unique_id, 'TV-VIW-' || LPAD(u.id::text, 4, '0')) AS unique_id,
             COALESCE(
               (
                 SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'category', d.category))
                 FROM document_permissions dp
                 JOIN documents d ON d.id = dp.document_id
                 WHERE dp.user_id = u.id AND d.owner_id = $2
               ),
               '[]'::json
             ) AS assigned_documents
      FROM users u
      WHERE u.id = $1 AND u.role = 'viewer' AND u.owner_id = $2
      LIMIT 1
    `, [id, ownerId]);

    if (!result.rows[0]) {
      await writeAudit({
        actorId: ownerId,
        action: "owner_read_viewer",
        targetUserId: id,
        outcome: "denied",
        details: { reason: "Viewer not found or cross-owner access blocked" }
      });
      return res.status(404).json({ error: "Viewer not found" });
    }

    return res.json({ viewer: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

// Create Viewer (Owner scope)
app.post("/api/owner/viewers", requireAuth, requireOwner, async (req, res, next) => {
  try {
    const ownerId = req.session.user.id;
    const { name, email, mobile, department, status, access_state, assigned_documents } = req.body || {};

    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.status(400).json({ error: "Valid viewer name is required (max 100 characters)" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Valid corporate email address is required" });
    }

    if (mobile && !isValidPhone(mobile)) {
      return res.status(400).json({ error: "Invalid mobile phone number format" });
    }

    const normEmail = email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [normEmail]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: `An account with email '${normEmail}' already exists.` });
    }

    // Role cannot be escalated by owner
    const initialStatus = ["active", "inactive", "suspended"].includes(String(status).toLowerCase())
      ? String(status).toLowerCase()
      : "active";

    const initialAccess = ["granted", "restricted", "revoked"].includes(String(access_state).toLowerCase())
      ? String(access_state).toLowerCase()
      : initialStatus === "inactive"
      ? "restricted"
      : initialStatus === "suspended"
      ? "revoked"
      : "granted";

    const sanitizedDept = sanitizeFormulaInjection((department || "Operations").trim().slice(0, 100));
    const sanitizedMobile = mobile ? sanitizeFormulaInjection(mobile.trim().slice(0, 25)) : null;
    const sanitizedName = sanitizeFormulaInjection(name.trim().slice(0, 100));

    const randomSecret = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomSecret, 12);

    const insertResult = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, owner_id, status, access_state, mobile, department, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, 'viewer', $4, $5, $6, $7, $8, $4, NOW(), NOW())
      RETURNING id, owner_id, name, email, role, status, access_state, mobile, department, created_at, updated_at
    `, [
      sanitizedName,
      normEmail,
      passwordHash,
      ownerId,
      initialStatus,
      initialAccess,
      sanitizedMobile,
      sanitizedDept
    ]);

    const newViewer = insertResult.rows[0];
    const uniqueId = generateUniqueId("viewer", newViewer.id);
    await pool.query("UPDATE users SET unique_id = $1 WHERE id = $2", [uniqueId, newViewer.id]);
    newViewer.unique_id = uniqueId;

    // Handle assigned documents (only documents owned by authenticated owner)
    const validAssignedDocs = [];
    if (Array.isArray(assigned_documents) && assigned_documents.length > 0) {
      const docIds = assigned_documents
        .map((d) => (typeof d === "object" && d !== null ? d.id : d))
        .filter((d) => validDocumentId(String(d)));

      if (docIds.length > 0) {
        const ownerDocs = await pool.query(
          "SELECT id, name, category FROM documents WHERE id = ANY($1::bigint[]) AND owner_id = $2",
          [docIds, ownerId]
        );

        for (const doc of ownerDocs.rows) {
          await pool.query(`
            INSERT INTO document_permissions (document_id, user_id, permission)
            VALUES ($1, $2, 'read')
            ON CONFLICT (document_id, user_id) DO NOTHING
          `, [doc.id, newViewer.id]);
          validAssignedDocs.push(doc);
        }
      }
    }
    newViewer.assigned_documents = validAssignedDocs;

    await writeAudit({
      actorId: ownerId,
      action: "owner_create_viewer",
      targetUserId: newViewer.id,
      outcome: "success",
      details: { email: newViewer.email, department: newViewer.department, status: newViewer.status }
    });

    return res.status(201).json({
      success: true,
      viewer: newViewer
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return next(error);
  }
});

// Update Viewer details (Strict tenant isolation)
app.patch("/api/owner/viewers/:id", requireAuth, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.session.user.id;

    if (!validUserId(id)) {
      return res.status(404).json({ error: "Viewer not found" });
    }

    // Strict tenant check: must be role='viewer' AND owner_id=ownerId
    const existingResult = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'viewer' AND owner_id = $2 LIMIT 1",
      [id, ownerId]
    );

    if (!existingResult.rows[0]) {
      return res.status(404).json({ error: "Viewer not found" });
    }
    const current = existingResult.rows[0];

    // Role cannot be changed by owner
    if (req.body.role && req.body.role.toLowerCase() !== "viewer") {
      return res.status(403).json({ error: "Owners cannot alter user roles or elevate privileges" });
    }

    const { name, email, mobile, department, status, access_state, assigned_documents } = req.body || {};

    let updatedName = current.name;
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ error: "Valid viewer name is required" });
      }
      updatedName = sanitizeFormulaInjection(name.trim().slice(0, 100));
    }

    let updatedEmail = current.email;
    if (email !== undefined) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "Valid corporate email is required" });
      }
      const norm = email.trim().toLowerCase();
      if (norm !== current.email.toLowerCase()) {
        const dupCheck = await pool.query("SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1", [norm, id]);
        if (dupCheck.rows[0]) {
          return res.status(409).json({ error: `An account with email '${norm}' already exists.` });
        }
        updatedEmail = norm;
      }
    }

    let updatedMobile = current.mobile;
    if (mobile !== undefined) {
      if (mobile && !isValidPhone(mobile)) {
        return res.status(400).json({ error: "Invalid mobile phone number format" });
      }
      updatedMobile = mobile ? sanitizeFormulaInjection(mobile.trim().slice(0, 25)) : null;
    }

    let updatedDept = current.department;
    if (department !== undefined) {
      updatedDept = sanitizeFormulaInjection(String(department).trim().slice(0, 100));
    }

    let updatedStatus = current.status;
    if (status !== undefined) {
      const s = String(status).toLowerCase().trim();
      if (["active", "inactive", "suspended"].includes(s)) {
        updatedStatus = s;
      }
    }

    let updatedAccess = current.access_state || (updatedStatus === "inactive" ? "restricted" : updatedStatus === "suspended" ? "revoked" : "granted");
    if (access_state !== undefined) {
      const a = String(access_state).toLowerCase().trim();
      if (["granted", "restricted", "revoked"].includes(a)) {
        updatedAccess = a;
      }
    }

    const updateResult = await pool.query(`
      UPDATE users
      SET name = $1, email = $2, mobile = $3, department = $4, status = $5, access_state = $6, updated_at = NOW()
      WHERE id = $7 AND role = 'viewer' AND owner_id = $8
      RETURNING id, owner_id, name, email, role, status, access_state, mobile, department, created_at, updated_at, unique_id
    `, [updatedName, updatedEmail, updatedMobile, updatedDept, updatedStatus, updatedAccess, id, ownerId]);

    const updated = updateResult.rows[0];

    // Synchronize document permissions for this owner's documents
    if (Array.isArray(assigned_documents)) {
      await pool.query(`
        DELETE FROM document_permissions
        WHERE user_id = $1 AND document_id IN (SELECT id FROM documents WHERE owner_id = $2)
      `, [id, ownerId]);

      const docIds = assigned_documents
        .map((d) => (typeof d === "object" && d !== null ? d.id : d))
        .filter((d) => validDocumentId(String(d)));

      if (docIds.length > 0) {
        const ownerDocs = await pool.query(
          "SELECT id FROM documents WHERE id = ANY($1::bigint[]) AND owner_id = $2",
          [docIds, ownerId]
        );

        for (const doc of ownerDocs.rows) {
          await pool.query(`
            INSERT INTO document_permissions (document_id, user_id, permission)
            VALUES ($1, $2, 'read')
            ON CONFLICT (document_id, user_id) DO NOTHING
          `, [doc.id, id]);
        }
      }
    }

    // Invalidate active sessions if status is inactive or suspended
    if (updatedStatus === "inactive" || updatedStatus === "suspended") {
      try {
        await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text", [String(id)]);
      } catch (_sessErr) {}
    }

    // Fetch assigned documents for response
    const assignedRes = await pool.query(`
      SELECT d.id, d.name, d.category
      FROM document_permissions dp
      JOIN documents d ON d.id = dp.document_id
      WHERE dp.user_id = $1 AND d.owner_id = $2
    `, [id, ownerId]);
    updated.assigned_documents = assignedRes.rows;

    await writeAudit({
      actorId: ownerId,
      action: "owner_update_viewer",
      targetUserId: id,
      outcome: "success",
      details: { updatedFields: Object.keys(req.body) }
    });

    return res.json({
      success: true,
      viewer: updated
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return next(error);
  }
});

// Toggle Viewer Status (Strict tenant isolation)
app.patch("/api/owner/viewers/:id/status", requireAuth, requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.session.user.id;
    const { status, reason } = req.body || {};

    if (!validUserId(id)) {
      return res.status(404).json({ error: "Viewer not found" });
    }

    // Strict tenant check
    const existing = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'viewer' AND owner_id = $2 LIMIT 1",
      [id, ownerId]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Viewer not found" });
    }

    const validStatuses = new Set(["active", "inactive", "suspended"]);
    if (!status || !validStatuses.has(String(status).toLowerCase())) {
      return res.status(400).json({ error: "Valid status ('active', 'inactive', 'suspended') is required" });
    }

    const newStatus = String(status).toLowerCase();
    const newAccess = newStatus === "inactive" ? "restricted" : newStatus === "suspended" ? "revoked" : "granted";

    const result = await pool.query(`
      UPDATE users
      SET status = $1, access_state = $2, updated_at = NOW()
      WHERE id = $3 AND role = 'viewer' AND owner_id = $4
      RETURNING id, owner_id, name, email, role, status, access_state, unique_id
    `, [newStatus, newAccess, id, ownerId]);

    if (newStatus === "inactive" || newStatus === "suspended") {
      try {
        await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text", [String(id)]);
      } catch (_sessErr) {}
    }

    await writeAudit({
      actorId: ownerId,
      action: "owner_viewer_status_update",
      targetUserId: id,
      outcome: "success",
      details: { newStatus, reason: reason || "" }
    });

    return res.json({
      success: true,
      viewer: result.rows[0],
      status: newStatus,
      reason: reason || ""
    });
  } catch (error) {
    return next(error);
  }
});

// Import Viewers from CSV / Spreadsheet (Strict tenant isolation)
app.post("/api/owner/viewers/import", requireAuth, requireOwner, uploadImport.single("file"), async (req, res, next) => {
  try {
    const ownerId = req.session.user.id;
    let rows = [];

    if (req.file) {
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "Import file exceeds the 5 MB limit" });
      }
      const rawText = req.file.buffer.toString("utf8");
      rows = parseCsv(rawText);
    } else if (Array.isArray(req.body.rows)) {
      rows = req.body.rows.map((r, i) => {
        const item = { ...r, _rowNum: i + 1 };
        normalizeRowAliases(item);
        return item;
      });
    } else if (typeof req.body.csvText === "string") {
      rows = parseCsv(req.body.csvText);
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "No valid rows found in import data." });
    }

    const emailsToCheck = rows
      .map((r) => (r.email || "").trim().toLowerCase())
      .filter(Boolean);

    let existingEmailSet = new Set();
    if (emailsToCheck.length > 0) {
      const existingRes = await pool.query(
        "SELECT email FROM users WHERE email = ANY($1::text[])",
        [emailsToCheck]
      );
      existingEmailSet = new Set(existingRes.rows.map((row) => row.email.toLowerCase()));
    }

    const seenInFile = new Set();
    const validRows = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const rowNum = row._rowNum || idx + 1;
      const rawEmail = (row.email || "").trim();
      const rawName = (row.name || "").trim();
      const normEmail = rawEmail.toLowerCase();

      if (!rawEmail) {
        errors.push({ row: rowNum, error: "Missing required email address." });
        return;
      }

      if (!isValidEmail(rawEmail)) {
        errors.push({ row: rowNum, email: rawEmail, error: "Invalid email format." });
        return;
      }

      if (!rawName) {
        errors.push({ row: rowNum, email: rawEmail, error: "Missing required viewer name." });
        return;
      }

      if (rawName.length > 100) {
        errors.push({ row: rowNum, email: rawEmail, error: "Viewer name exceeds 100 characters." });
        return;
      }

      if (row.mobile && !isValidPhone(row.mobile)) {
        errors.push({ row: rowNum, email: rawEmail, error: "Invalid mobile phone format." });
        return;
      }

      if (seenInFile.has(normEmail)) {
        errors.push({ row: rowNum, email: rawEmail, error: `Duplicate email '${rawEmail}' within import file.` });
        return;
      }

      if (existingEmailSet.has(normEmail)) {
        errors.push({ row: rowNum, email: rawEmail, error: `Email '${rawEmail}' is already registered in TrustVault.` });
        return;
      }

      seenInFile.add(normEmail);

      const status = row.status === "inactive" ? "inactive" : row.status === "suspended" ? "suspended" : "active";
      const access_state = row.access_state === "restricted" ? "restricted" : row.access_state === "revoked" ? "revoked" : "granted";

      validRows.push({
        name: sanitizeFormulaInjection(rawName),
        email: normEmail,
        mobile: row.mobile ? sanitizeFormulaInjection(String(row.mobile).trim().slice(0, 25)) : null,
        department: sanitizeFormulaInjection((row.department || "Operations").trim().slice(0, 100)),
        status,
        access_state
      });
    });

    if (validRows.length === 0) {
      return res.status(400).json({
        success: false,
        addedCount: 0,
        errors,
        importedViewers: []
      });
    }

    const client = await pool.connect();
    const importedViewers = [];

    try {
      await client.query("BEGIN");

      for (const item of validRows) {
        const randPass = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randPass, 10);

        const insRes = await client.query(`
          INSERT INTO users (name, email, password_hash, role, owner_id, status, access_state, mobile, department, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, 'viewer', $4, $5, $6, $7, $8, $4, NOW(), NOW())
          RETURNING id, owner_id, name, email, role, status, access_state, mobile, department, created_at, updated_at
        `, [
          item.name,
          item.email,
          passwordHash,
          ownerId,
          item.status,
          item.access_state,
          item.mobile,
          item.department
        ]);

        const viewer = insRes.rows[0];
        const uniqueId = generateUniqueId("viewer", viewer.id);
        await client.query("UPDATE users SET unique_id = $1 WHERE id = $2", [uniqueId, viewer.id]);
        viewer.unique_id = uniqueId;
        viewer.assigned_documents = [];

        importedViewers.push(viewer);
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    await writeAudit({
      actorId: ownerId,
      action: "owner_import_viewers",
      outcome: "success",
      details: { addedCount: importedViewers.length, errorCount: errors.length }
    });

    return res.status(201).json({
      success: true,
      addedCount: importedViewers.length,
      errors,
      importedViewers
    });
  } catch (error) {
    return next(error);
  }
});

// Admin Documents Global Oversight
app.get("/api/admin/documents", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { search, owner, category, from, to, limit: reqLimit, offset: reqOffset } = req.query;
    const conditions = [];
    const values = [];

    function addFilter(sql, val) {
      values.push(val);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    if (typeof search === "string" && search.trim()) {
      addFilter("d.name ILIKE ?", `%${escapeLike(search.trim().slice(0, 255))}%`);
    }

    if (typeof category === "string" && category.trim() && category !== "all") {
      addFilter("d.category ILIKE ?", `%${escapeLike(category.trim().slice(0, 100))}%`);
    }

    if (typeof owner === "string" && owner.trim()) {
      const q = `%${escapeLike(owner.trim().slice(0, 255))}%`;
      values.push(q);
      conditions.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
    }

    if (typeof from === "string" && from.trim() && isValidCalendarDate(from)) {
      addFilter("d.created_at >= ?::date", from.trim());
    }

    if (typeof to === "string" && to.trim() && isValidCalendarDate(to)) {
      addFilter("d.created_at < (?::date + INTERVAL '1 day')", to.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = Math.min(Math.max(1, Number(reqLimit || 50)), 200);
    const offset = Math.max(0, Number(reqOffset || 0));

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM documents d JOIN users u ON u.id = d.owner_id ${whereClause}`,
      values
    );

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const result = await pool.query(`
      SELECT d.id, d.owner_id, d.name, d.category, d.mime_type, d.size_bytes,
             d.timer_enabled, d.timer_duration_minutes, d.auto_delete, d.unlocked_at,
             d.created_at, d.updated_at,
             u.name AS owner_name, u.email AS owner_email
      FROM documents d
      JOIN users u ON u.id = d.owner_id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, values);

    return res.json({
      documents: result.rows,
      total: countRes.rows[0]?.total || 0
    });
  } catch (error) {
    return next(error);
  }
});

// Admin Permissions Global Oversight
app.get("/api/admin/permissions", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const permissionsRes = await pool.query(`
      SELECT dp.id, dp.document_id, dp.user_id, dp.permission, dp.created_at,
             d.name AS document_name,
             u.name AS user_name, u.email AS user_email,
             owner.name AS owner_name, owner.email AS owner_email,
             ('TV-USR-00' || dp.user_id) AS unique_id
      FROM document_permissions dp
      JOIN documents d ON d.id = dp.document_id
      JOIN users u ON u.id = dp.user_id
      JOIN users owner ON owner.id = d.owner_id
      ORDER BY dp.created_at DESC
      LIMIT 100
    `);

    const historyRes = await pool.query(`
      SELECT a.id, a.actor_id, a.action, a.document_id, a.target_user_id,
             a.outcome, a.details, a.created_at,
             u.name AS actor_name, u.email AS actor_email,
             target.name AS target_user_name, target.email AS target_user_email,
             d.name AS document_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN users target ON target.id = a.target_user_id
      LEFT JOIN documents d ON d.id = a.document_id
      WHERE a.action IN ('permission_grant', 'permission_revoke', 'admin_permission_correct')
      ORDER BY a.created_at DESC
      LIMIT 50
    `);

    const permissionsMap = {};
    for (const row of permissionsRes.rows) {
      if (!permissionsMap[row.document_id]) {
        permissionsMap[row.document_id] = [];
      }
      permissionsMap[row.document_id].push(row);
    }

    return res.json({
      permissions: permissionsMap,
      permissionsList: permissionsRes.rows,
      history: historyRes.rows.map(h => ({
        id: h.id,
        documentId: h.document_id,
        documentName: h.document_name || `Document #${h.document_id}`,
        targetUserEmail: h.target_user_email || `User #${h.target_user_id}`,
        targetUserName: h.target_user_name || `User #${h.target_user_id}`,
        permission: h.action === "permission_revoke" ? "none" : (h.details?.permission || "read"),
        action: h.action,
        changedByEmail: h.actor_email || "System",
        changedByName: h.actor_name || "System",
        timestamp: h.created_at,
        reason: h.details?.reason || "Administrative update"
      }))
    });
  } catch (error) {
    return next(error);
  }
});

// Admin Corrective Permission Action
app.post("/api/admin/permissions/correct", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { documentId, userId, action, reason } = req.body || {};

    if (!validDocumentId(String(documentId)) || !validUserId(String(userId))) {
      return res.status(400).json({ error: "Valid document ID and user ID required" });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return res.status(400).json({ error: "A valid administrative reason (minimum 5 characters) is required" });
    }

    if (action === "revoke") {
      await pool.query(
        "DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2",
        [documentId, userId]
      );
    } else {
      await pool.query(
        `INSERT INTO document_permissions (document_id, user_id, permission, granted_by)
         VALUES ($1, $2, 'read', $3)
         ON CONFLICT (document_id, user_id) DO UPDATE SET permission = 'read', created_at = NOW()`,
        [documentId, userId, req.session.user.id]
      );
    }

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_permission_correct",
      documentId,
      targetUserId: userId,
      outcome: "success",
      details: { action, reason: reason.trim() }
    });

    return res.json({
      success: true,
      message: `Permission successfully ${action === 'revoke' ? 'revoked' : 'corrected'}`
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Admin Secret Key Management Endpoints
// Strictly accessible by Administrator role only (server-side requireAdmin check)
// Never exposes master KEK or plaintext keys in responses, logs, or audit events
// --------------------------------------------------

// 1. List All Managed Keys & Audit Events
app.get("/api/admin/keys", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const keysResult = await pool.query(
      `SELECT k.id, k.name, k.algorithm, k.status, k.scope, k.created_at, k.rotated_at, k.revoked_at,
              u.name as created_by_name, u.email as created_by_email,
              COUNT(d.id)::int as document_count
       FROM encryption_keys k
       LEFT JOIN users u ON u.id = k.created_by
       LEFT JOIN documents d ON d.key_id = k.id
       GROUP BY k.id, k.name, k.algorithm, k.status, k.scope, k.created_at, k.rotated_at, k.revoked_at, u.name, u.email
       ORDER BY k.created_at DESC`
    );

    const auditResult = await pool.query(
      `SELECT a.id, a.action, a.outcome, a.details, a.created_at,
              u.name as actor_name, u.email as actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.action IN ('key_generation', 'key_rotation', 'key_revocation', 'key_release')
       ORDER BY a.created_at DESC
       LIMIT 50`
    );

    const keys = keysResult.rows;
    const stats = {
      totalKeys: keys.length,
      activeKeys: keys.filter((k) => k.status === "active").length,
      rotatedKeys: keys.filter((k) => k.status === "rotated").length,
      revokedKeys: keys.filter((k) => k.status === "revoked").length,
      protectedDocuments: keys.reduce((sum, k) => sum + (k.document_count || 0), 0)
    };

    return res.status(200).json({
      keys,
      auditEvents: auditResult.rows,
      stats
    });
  } catch (error) {
    return next(error);
  }
});

// 2. Get Single Key Details & Protected Documents
app.get("/api/admin/keys/:keyId", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { keyId } = req.params;

    const keyResult = await pool.query(
      `SELECT k.id, k.name, k.algorithm, k.status, k.scope, k.created_at, k.rotated_at, k.revoked_at,
              u.name as created_by_name, u.email as created_by_email,
              COUNT(d.id)::int as document_count
       FROM encryption_keys k
       LEFT JOIN users u ON u.id = k.created_by
       LEFT JOIN documents d ON d.key_id = k.id
       WHERE k.id = $1
       GROUP BY k.id, k.name, k.algorithm, k.status, k.scope, k.created_at, k.rotated_at, k.revoked_at, u.name, u.email`,
      [keyId]
    );

    const key = keyResult.rows[0];
    if (!key) {
      return res.status(404).json({ error: "Encryption key not found" });
    }

    const docsResult = await pool.query(
      `SELECT d.id, d.name, d.category, d.mime_type, d.size_bytes, d.encryption_version, d.created_at,
              u.name as owner_name, u.email as owner_email
       FROM documents d
       LEFT JOIN users u ON u.id = d.owner_id
       WHERE d.key_id = $1
       ORDER BY d.created_at DESC
       LIMIT 100`,
      [keyId]
    );

    return res.status(200).json({
      key,
      documents: docsResult.rows
    });
  } catch (error) {
    return next(error);
  }
});

// 3. Generate Cryptographically Secure 256-bit Document Key
app.post("/api/admin/keys/generate", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, scope, confirm } = req.body || {};

    if (!confirm) {
      return res.status(400).json({
        error: "Explicit confirmation is required to generate a new encryption key"
      });
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        error: "A descriptive key name is required"
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        error: "Key name must not exceed 100 characters"
      });
    }

    const key = await createManagedKey(pool, {
      name: name.trim(),
      scope: typeof scope === "string" && scope.trim() ? scope.trim() : "document",
      createdBy: req.session.user.id
    });

    await writeAudit({
      actorId: req.session.user.id,
      action: "key_generation",
      outcome: "success",
      details: {
        keyId: key.id,
        name: key.name,
        algorithm: key.algorithm,
        scope: key.scope
      }
    });

    return res.status(201).json({
      message: "Key generated successfully",
      key
    });
  } catch (error) {
    return next(error);
  }
});

// 4. Rotate Key & Rewrap Associated Documents safely
app.post("/api/admin/keys/:keyId/rotate", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { keyId } = req.params;
    const { confirm } = req.body || {};

    if (!confirm) {
      return res.status(400).json({
        error: "Explicit confirmation is required to rotate an encryption key"
      });
    }

    const rotation = await rotateManagedKey(pool, keyId, req.session.user.id);

    await writeAudit({
      actorId: req.session.user.id,
      action: "key_rotation",
      outcome: "success",
      details: {
        oldKeyId: rotation.oldKeyId,
        newKeyId: rotation.newKeyId,
        rewrappedCount: rotation.rewrappedCount
      }
    });

    return res.status(200).json({
      message: "Key rotated successfully",
      ...rotation
    });
  } catch (error) {
    if (error.message && error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message && error.message.includes("revoked")) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// 5. Revoke Key
app.post("/api/admin/keys/:keyId/revoke", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { keyId } = req.params;
    const { confirm, reason } = req.body || {};

    if (!confirm) {
      return res.status(400).json({
        error: "Explicit confirmation is required to revoke an encryption key"
      });
    }

    const revoked = await revokeManagedKey(pool, keyId, req.session.user.id);

    await writeAudit({
      actorId: req.session.user.id,
      action: "key_revocation",
      outcome: "success",
      details: {
        keyId: revoked.id,
        reason: reason && typeof reason === "string" ? reason.trim() : "Administrative revocation"
      }
    });

    return res.status(200).json({
      message: "Key revoked successfully",
      key: revoked
    });
  } catch (error) {
    if (error.message && error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    return next(error);
  }
});

// Admin Complaints Inbox
app.get("/api/admin/complaints", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { search, category, status, priority, limit: reqLimit, offset: reqOffset } = req.query;
    const conditions = [];
    const values = [];

    function addFilter(sql, val) {
      values.push(val);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    if (typeof search === "string" && search.trim()) {
      const q = `%${escapeLike(search.trim().slice(0, 100))}%`;
      values.push(q);
      conditions.push(`(c.reference_id ILIKE $${values.length} OR c.subject ILIKE $${values.length} OR u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
    }

    if (typeof category === "string" && category.trim() && category !== "all") {
      addFilter("c.category ILIKE ?", `%${escapeLike(category.trim().slice(0, 100))}%`);
    }

    if (typeof status === "string" && status.trim() && status !== "all") {
      addFilter("c.status ILIKE ?", status.trim());
    }

    if (typeof priority === "string" && priority.trim() && priority !== "all") {
      addFilter("c.priority ILIKE ?", priority.trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = Math.min(Math.max(1, Number(reqLimit || 50)), 200);
    const offset = Math.max(0, Number(reqOffset || 0));

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM complaints c LEFT JOIN users u ON u.id = c.user_id ${whereClause}`,
      values
    );

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const result = await pool.query(`
      SELECT c.id, c.reference_id, c.category, c.subject, c.description,
             c.related_document_name, c.attachment_name, c.status, c.priority,
             c.timeline, c.created_at, c.updated_at,
             c.reference_id AS "referenceId", c.created_at AS "createdAt",
             u.name AS "submitterName", u.email AS "submitterEmail"
      FROM complaints c
      LEFT JOIN users u ON u.id = c.user_id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, values);

    return res.json({
      complaints: result.rows,
      total: countRes.rows[0]?.total || 0
    });
  } catch (error) {
    return next(error);
  }
});

// Admin Complaint Status Update & Note Response
app.patch("/api/admin/complaints/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, responseNote, emailNotified } = req.body || {};

    const existing = await pool.query("SELECT * FROM complaints WHERE id = $1", [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const complaint = existing.rows[0];
    const timeline = Array.isArray(complaint.timeline) ? [...complaint.timeline] : [];

    const statusMap = {
      submitted: "Submitted",
      "in review": "In Review",
      in_review: "In Review",
      resolved: "Resolved",
      closed: "Closed"
    };
    const priorityMap = {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical"
    };

    const updatedStatus = status
      ? (statusMap[String(status).toLowerCase().trim()] || status)
      : complaint.status;
    const updatedPriority = priority
      ? (priorityMap[String(priority).toLowerCase().trim()] || priority)
      : complaint.priority;

    let emailDispatched = false;
    if (Boolean(emailNotified)) {
      if (complaint.user_id) {
        const userRes = await pool.query("SELECT email FROM users WHERE id = $1 LIMIT 1", [complaint.user_id]);
        const recipientEmail = userRes.rows[0]?.email;
        if (recipientEmail) {
          try {
            await sendComplaintNotificationEmail({
              to: recipientEmail,
              complaint: {
                ...complaint,
                status: updatedStatus,
                priority: updatedPriority
              },
              responseNote: (responseNote && responseNote.trim()) || "Your support ticket has been updated."
            });
            emailDispatched = true;
          } catch (_err) {
            emailDispatched = false;
          }
        }
      }
    }

    if (responseNote && typeof responseNote === "string" && responseNote.trim()) {
      timeline.push({
        id: Date.now(),
        author: req.session.user.name || "Admin Support",
        message: responseNote.trim(),
        timestamp: new Date().toISOString(),
        type: "admin",
        emailDispatched
      });
    }

    const result = await pool.query(`
      UPDATE complaints
      SET status = $1, priority = $2, timeline = $3::jsonb, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [updatedStatus, updatedPriority, JSON.stringify(timeline), id]);

    await writeAudit({
      actorId: req.session.user.id,
      action: "admin_complaint_update",
      outcome: "success",
      details: { complaintId: id, status: updatedStatus, priority: updatedPriority }
    });

    const updated = result.rows[0];
    return res.json({
      success: true,
      complaint: {
        ...updated,
        referenceId: updated.reference_id,
        createdAt: updated.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// User Support & Complaints APIs
// --------------------------------------------------

app.post("/api/support/complaints", requireAuth, async (req, res, next) => {
  try {
    const { category, subject, description, relatedDocumentName, attachmentName } = req.body || {};

    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ error: "Subject is required" });
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Description is required" });
    }

    const refId = `TV-CMP-${Math.floor(10000 + Math.random() * 90000)}`;
    const timeline = [
      {
        id: 1,
        author: "System Audit",
        message: `Complaint submitted with reference ID ${refId}. Assigned to Enterprise Support.`,
        timestamp: new Date().toISOString(),
        type: "system"
      }
    ];

    const result = await pool.query(`
      INSERT INTO complaints
        (reference_id, user_id, category, subject, description, related_document_name, attachment_name, status, priority, timeline)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Submitted', 'Medium', $8::jsonb)
      RETURNING *
    `, [
      refId,
      req.session.user.id,
      (category || "General").trim().slice(0, 100),
      subject.trim().slice(0, 255),
      description.trim(),
      relatedDocumentName ? String(relatedDocumentName).trim().slice(0, 255) : null,
      attachmentName ? String(attachmentName).trim().slice(0, 255) : null,
      JSON.stringify(timeline)
    ]);

    await writeAudit({
      actorId: req.session.user.id,
      action: "support_complaint_submit",
      outcome: "success",
      details: { referenceId: refId }
    });

    const complaint = result.rows[0];
    return res.status(201).json({
      success: true,
      complaint: {
        ...complaint,
        referenceId: complaint.reference_id,
        createdAt: complaint.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/support/complaints", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT c.*, c.reference_id AS "referenceId", c.created_at AS "createdAt"
      FROM complaints c
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [req.session.user.id]);

    return res.json({ complaints: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/support/security-report", requireAuth, async (req, res, next) => {
  try {
    const { incidentType, subject, description } = req.body || {};
    const refId = `TV-SEC-${Math.floor(10000 + Math.random() * 90000)}`;
    const timeline = [
      {
        id: 1,
        author: "SOC Dispatch",
        message: `Security report logged with reference ID ${refId}. Priority elevated to Critical.`,
        timestamp: new Date().toISOString(),
        type: "system"
      }
    ];

    const result = await pool.query(`
      INSERT INTO complaints
        (reference_id, user_id, category, subject, description, status, priority, timeline)
      VALUES ($1, $2, 'Security Incident', $3, $4, 'In Review', 'Critical', $5::jsonb)
      RETURNING *
    `, [
      refId,
      req.session.user.id,
      (subject || "Security Alert").trim().slice(0, 255),
      (description || "Security alert submitted").trim(),
      JSON.stringify(timeline)
    ]);

    await writeAudit({
      actorId: req.session.user.id,
      action: "security_report_submit",
      outcome: "success",
      details: { referenceId: refId, incidentType }
    });

    const report = result.rows[0];
    return res.status(201).json({
      success: true,
      report: {
        id: report.id,
        referenceId: report.reference_id,
        incidentType: incidentType || "Suspicious Activity",
        subject: report.subject,
        status: "Escalated to SOC",
        createdAt: report.created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// User Profile & Terms Acceptance APIs
// --------------------------------------------------

app.patch("/api/users/profile", requireAuth, async (req, res, next) => {
  try {
    const { name, mobile, avatarUrl } = req.body || {};
    const updates = [];
    const values = [];

    if (typeof name === "string" && name.trim()) {
      values.push(name.trim().slice(0, 100));
      updates.push(`name = $${values.length}`);
    }

    if (typeof mobile === "string") {
      values.push(mobile.trim().slice(0, 25));
      updates.push(`mobile = $${values.length}`);
      // Unverified until MSG91 OTP is completed
      updates.push("phone_verified = FALSE");
      updates.push("phone_verified_at = NULL");
    }

    if (typeof avatarUrl === "string") {
      values.push(avatarUrl.trim().slice(0, 500));
      updates.push(`avatar_url = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No profile update fields provided" });
    }

    values.push(req.session.user.id);
    const result = await pool.query(`
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = $${values.length}
      RETURNING id, name, email, role, status, mobile, avatar_url, phone_verified, phone_verified_at, created_at
    `, values);

    const updatedUser = result.rows[0];
    req.session.user = {
      ...req.session.user,
      name: updatedUser.name,
      avatar_url: updatedUser.avatar_url,
      mobile: updatedUser.mobile,
      phone_verified: updatedUser.phone_verified
    };

    return res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    return next(error);
  }
});

const CURRENT_TERMS_VERSION = "2026.1";

app.get("/api/auth/terms/status", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT terms_version, terms_accepted_at FROM users WHERE id = $1",
      [req.session.user.id]
    );
    const row = result.rows[0];
    const isAccepted = Boolean(row && row.terms_version === CURRENT_TERMS_VERSION && row.terms_accepted_at);

    return res.json({
      currentVersion: CURRENT_TERMS_VERSION,
      accepted: isAccepted,
      acceptedVersion: row?.terms_version || null,
      acceptedAt: row?.terms_accepted_at ? new Date(row.terms_accepted_at).toISOString() : null
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/terms/accept", requireAuth, async (req, res, next) => {
  try {
    const version = req.body?.version || CURRENT_TERMS_VERSION;
    const now = new Date();

    await pool.query(
      "UPDATE users SET terms_version = $1, terms_accepted_at = $2 WHERE id = $3",
      [version, now, req.session.user.id]
    );

    await writeAudit({
      actorId: req.session.user.id,
      action: "terms_accept",
      outcome: "success",
      details: { version }
    });

    return res.json({
      success: true,
      version,
      termsVersion: version,
      acceptedAt: now.toISOString()
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Password Reset Lifecycle APIs
// --------------------------------------------------

app.post("/api/auth/forgot-password", forgotPasswordLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !validEmail(email)) {
      return res.status(400).json({ error: "Valid email address required" });
    }

    const normEmail = email.trim().toLowerCase();
    const userRes = await pool.query("SELECT id, email, role FROM users WHERE email = $1 LIMIT 1", [normEmail]);
    const user = userRes.rows[0];

    if (user) {
      // Strictly prevent Admin accounts from password reset workflow (Requirement 2.2)
      if (user.role === "admin") {
        await writeAudit({
          actorId: user.id,
          action: "auth_forgot_password",
          outcome: "denied",
          details: { reason: "Password reset is not permitted for administrator accounts" }
        });

        return res.status(403).json({
          error: "Password reset is not permitted for administrator accounts."
        });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(`
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `, [user.id, tokenHash, expiresAt]);

      try {
        await sendPasswordResetEmail({ to: user.email, rawToken });
      } catch (_emailErr) {
        await writeAudit({
          actorId: user.id,
          action: "auth_forgot_password",
          outcome: "failure",
          details: { reason: "Email delivery failure" }
        });

        return res.status(503).json({
          error: "Email delivery service is currently unavailable. Please try again later."
        });
      }

      await writeAudit({
        actorId: user.id,
        action: "auth_forgot_password",
        outcome: "success",
        details: { expiresAt: expiresAt.toISOString() }
      });
    }

    return res.json({
      success: true,
      message: "If an account exists for this email, password reset instructions will be sent."
    });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/auth/reset-password/validate", async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ valid: false, error: "Missing reset token" });
    }

    const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");
    const result = await pool.query(`
      SELECT prt.id, prt.expires_at, prt.used, u.email, u.role
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1
      LIMIT 1
    `, [tokenHash]);

    const record = result.rows[0];
    if (!record || record.used || new Date(record.expires_at) < new Date() || record.role === "admin") {
      return res.json({
        valid: false,
        error: "This password reset link has expired or has already been used."
      });
    }

    return res.json({
      valid: true,
      email: record.email
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/reset-password", async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (
      typeof newPassword !== "string" ||
      Buffer.byteLength(newPassword, "utf8") < 12 ||
      Buffer.byteLength(newPassword, "utf8") > 72
    ) {
      return res.status(400).json({ error: "Password must be between 12 and 72 UTF-8 bytes" });
    }

    const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const tokenRes = await client.query(`
        SELECT prt.id, prt.user_id, prt.expires_at, prt.used, u.email, u.role
        FROM password_reset_tokens prt
        JOIN users u ON u.id = prt.user_id
        WHERE prt.token_hash = $1
        FOR UPDATE
      `, [tokenHash]);

      const record = tokenRes.rows[0];
      if (!record || record.used || new Date(record.expires_at) < new Date() || record.role === "admin") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "This password reset token has expired or has already been used."
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, record.user_id]);
      await client.query("UPDATE password_reset_tokens SET used = TRUE WHERE id = $1", [record.id]);

      await client.query("DELETE FROM user_sessions WHERE sess->'user'->>'id' = $1::text", [String(record.user_id)]);

      await writeAudit({
        actorId: record.user_id,
        action: "auth_reset_password",
        outcome: "success",
        db: client
      });

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Password updated successfully. You can now log in with your new credentials."
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Document Activity & History APIs
// --------------------------------------------------

app.get("/api/documents/activity", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const result = await pool.query(`
      SELECT a.id, a.actor_id, a.action, a.document_id, a.outcome, a.details, a.created_at,
             u.name AS actor_name, u.email AS actor_email,
             d.name AS document_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN documents d ON d.id = a.document_id
      WHERE a.actor_id = $1
         OR a.document_id IN (SELECT id FROM documents WHERE owner_id = $1)
      ORDER BY a.created_at DESC
      LIMIT 100
    `, [userId]);

    return res.json({ activity: result.rows });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// 404 handler
// --------------------------------------------------

app.use((_req, res) => {

  return res.status(404).json({
    error: "Not found"
  });
});

// --------------------------------------------------
// Centralized error handler
// --------------------------------------------------

app.use((error, req, res, _next) => {
  if (error === invalidCsrfTokenError) {
    return res.status(403).json({
      error: "Invalid CSRF token"
    });
  }

  if (
    error.type === "entity.parse.failed" ||
    (error instanceof SyntaxError && error.status === 400)
  ) {
    return res.status(400).json({
      error: "Malformed JSON payload"
    });
  }

  if (error.type === "entity.too.large" || error.status === 413) {
    return res.status(413).json({
      error: "Payload too large"
    });
  }

  if (error instanceof multer.MulterError) {
    if (req?.session?.user?.id) {
      writeAudit({
        actorId: req.session.user.id,
        action: "document_upload",
        outcome: "failure",
        details: {
          reason:
            error.code === "LIMIT_FILE_SIZE"
              ? "File exceeds the 10 MB limit"
              : "Invalid upload request"
        }
      }).catch(() => {});
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File exceeds the 10 MB limit"
      });
    }

    return res.status(400).json({
      error: "Invalid upload request"
    });
  }

  if (error.message === "Origin not allowed") {
    return res.status(403).json({
      error: "Origin not allowed"
    });
  }

  console.error(
    "Request failed:",
    error.message || "Unknown error"
  );

  if (res.headersSent) return;

  return res.status(500).json({
    error: "Internal server error"
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  const host = process.env.HOST || "0.0.0.0";

  app.listen(port, host, () => {
    console.log(`TrustVault API listening on http://${host}:${port}`);
  });
}

module.exports = app;