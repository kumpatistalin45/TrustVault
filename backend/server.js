require("dotenv").config();

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
const path = require("path");
const crypto = require("crypto");

const { encryptBuffer, decryptBuffer } = require("./encryption");
const pool = require("./db");

const app = express();
app.disable("x-powered-by");

const isProduction = process.env.NODE_ENV === "production";
const frontendOrigin =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_PERMISSIONS = new Set(["read", "edit"]);

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

const STORAGE_DIR = path.resolve(__dirname, "storage");

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

function sanitizeFilename(filename) {
  return path
    .basename(String(filename || "").replace(/[\\/]/g, "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function storagePathForKey(key) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
    throw new Error("Invalid storage key");
  }

  const filePath = path.resolve(STORAGE_DIR, key);

  if (path.dirname(filePath) !== STORAGE_DIR) {
    throw new Error("Invalid storage path");
  }

  return filePath;
}

async function removeStoredFile(key) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
    return;
  }

  try {
    await fsp.unlink(storagePathForKey(key));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not remove stored file.");
    }
  }
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

function decryptEnvelope(envelope) {
  if (
    !Buffer.isBuffer(envelope) ||
    envelope.length < 32 ||
    envelope.subarray(0, 4).toString("ascii") !== "TVE1"
  ) {
    throw new Error("Invalid encrypted file format");
  }

  return decryptBuffer({
    version: 1,
    iv: envelope.subarray(4, 16).toString("hex"),
    authTag: envelope.subarray(16, 32).toString("hex"),
    ciphertext: envelope.subarray(32)
  });
}

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === frontendOrigin) {
        return callback(null, true);
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
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/"
    }
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Try again later."
  }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many registration attempts. Try again later."
  }
});

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
    sameSite: "lax",
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

function requireAuth(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  return next();
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
  const result = await pool.query(
    `SELECT d.id, d.owner_id, d.name, d.category, d.mime_type,
            d.size_bytes, d.created_at, d.updated_at,
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
      const { name, email, password } = req.body || {};

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

      const passwordHash = await bcrypt.hash(password, 12);

      try {
        const result = await pool.query(
          `INSERT INTO users (name, email, password_hash, role)
           VALUES ($1, $2, $3, 'owner')
           RETURNING id, name, email, role, created_at`,
          [
            name.trim(),
            email.trim().toLowerCase(),
            passwordHash
          ]
        );

        return res.status(201).json({
          user: result.rows[0]
        });
      } catch (error) {
        if (error.code === "23505") {
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
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    if (
      email.length > 255 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        error: "Invalid email or password"
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    const hash = user
      ? user.password_hash
      : await dummyHashPromise;

    const matches = await bcrypt.compare(password, hash);

    if (!user || !matches) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      };

      req.session.save((saveError) => {
        if (saveError) return next(saveError);

        return res.json({
          user: req.session.user
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
      `SELECT id, name, email, role, created_at
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
      role: result.rows[0].role
    };

    return res.json({
      user: result.rows[0]
    });
  } catch (error) {
    return next(error);
  }
});

// --------------------------------------------------
// Logout
// --------------------------------------------------

app.post("/api/auth/logout", requireAuth, (req, res, next) => {
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

      const envelope = createEncryptedEnvelope(req.file.buffer);
      storageKey = crypto.randomBytes(32).toString("hex");

      await fsp.writeFile(
        storagePathForKey(storageKey),
        envelope,
        {
          flag: "wx",
          mode: 0o600
        }
      );

      fileWritten = true;

      client = await pool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
        `INSERT INTO documents
           (owner_id, name, category, storage_key, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, owner_id, name, category, mime_type,
                   size_bytes, created_at, updated_at`,
        [
          req.session.user.id,
          name,
          category,
          storageKey,
          String(
            req.file.mimetype || "application/octet-stream"
          ).slice(0, 150),
          req.file.size
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
          encryption: "AES-256-GCM",
          encryptionVersion: 1
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
        await removeStoredFile(storageKey);
      }

      return next(error);
    } finally {
      if (client) client.release();
    }
  }
);

// --------------------------------------------------
// List and search accessible documents
// Query parameters: name, owner, category, from, to
// --------------------------------------------------

app.get("/api/documents", requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { name, owner, category, from, to } = req.query;

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
        `%${name.trim().slice(0, 255)}%`
      );
    }

    if (typeof category === "string" && category.trim()) {
      addFilter(
        "d.category ILIKE ?",
        `%${category.trim().slice(0, 100)}%`
      );
    }

    if (typeof owner === "string" && owner.trim()) {
      values.push(`%${owner.trim().slice(0, 255)}%`);

      conditions.push(
        `(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`
      );
    }

    if (typeof from === "string" && from.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        return res.status(400).json({
          error: "Invalid from date"
        });
      }

      addFilter("d.created_at >= ?::date", from);
    }

    if (typeof to === "string" && to.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({
          error: "Invalid to date"
        });
      }

      addFilter(
        "d.created_at < (?::date + INTERVAL '1 day')",
        to
      );
    }

    const result = await pool.query(
      `SELECT d.id, d.owner_id, d.name, d.category, d.mime_type,
              d.size_bytes, d.created_at, d.updated_at,
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
       LIMIT 500`,
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
// Owner or edit permission required
// --------------------------------------------------

app.patch(
  "/api/documents/:id",
  requireAuth,
  async (req, res, next) => {
    let client;

    try {
      const { id } = req.params;
      const userId = req.session.user.id;
      const { name, category } = req.body || {};

      if (!validDocumentId(id)) {
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

      if (name === undefined && category === undefined) {
        return res.status(400).json({
          error: "At least one of name or category is required"
        });
      }

      const access = await pool.query(
        `SELECT d.id
         FROM documents d
         LEFT JOIN document_permissions dp
           ON dp.document_id = d.id AND dp.user_id = $2
         WHERE d.id = $1
           AND (d.owner_id = $2 OR dp.permission = 'edit')
         LIMIT 1`,
        [id, userId]
      );

      if (!access.rows[0]) {
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
               updated_at = NOW()
           WHERE id = $4
           RETURNING id, owner_id, name, category, mime_type,
                     size_bytes, created_at, updated_at`,
          [
            updatedName,
            category !== undefined,
            updatedCategory,
            id
          ]
        );

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
// Download and decrypt document
// --------------------------------------------------

app.get(
  "/api/documents/:id/download",
  requireAuth,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        await writeAudit({
          actorId,
          action: "document_download",
          outcome: "denied",
          details: { reason: "Invalid document ID" }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      const result = await pool.query(
        `SELECT d.id, d.owner_id, d.name, d.storage_key, d.size_bytes
         FROM documents d
         LEFT JOIN document_permissions dp
           ON dp.document_id = d.id AND dp.user_id = $2
         WHERE d.id = $1
           AND (d.owner_id = $2 OR dp.permission IN ('read', 'edit'))
         LIMIT 1`,
        [id, actorId]
      );

      const document = result.rows[0];

      if (!document) {
        await writeAudit({
          actorId,
          action: "document_download",
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

      let envelope;

      try {
        envelope = await fsp.readFile(
          storagePathForKey(document.storage_key)
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;

        await writeAudit({
          actorId,
          action: "document_download",
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
        plaintext = decryptEnvelope(envelope);

        if (plaintext.length !== Number(document.size_bytes)) {
          throw new Error("File size verification failed");
        }
      } catch (_error) {
        await writeAudit({
          actorId,
          action: "document_download",
          documentId: document.id,
          outcome: "failure",
          details: {
            reason: "Encrypted file authentication failed"
          }
        });

        return res.status(500).json({
          error: "File integrity verification failed"
        });
      }

      await writeAudit({
        actorId,
        action: "document_download",
        documentId: document.id,
        outcome: "success",
        details: { encryption: "AES-256-GCM" }
      });

      res.set({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Type": "application/octet-stream"
      });

      res.attachment(
        sanitizeFilename(document.name) || "download"
      );

      return res.send(plaintext);
    } catch (error) {
      return next(error);
    }
  }
);

// --------------------------------------------------
// Grant permission (owner only)
// --------------------------------------------------

app.post(
  "/api/documents/:id/permissions",
  requireAuth,
  async (req, res, next) => {
    let client;

    try {
      const { id } = req.params;
      const { email, permission } = req.body || {};
      const actorId = req.session.user.id;

      if (!validDocumentId(id)) {
        return res.status(404).json({
          error: "Document not found"
        });
      }

      if (!validEmail(email) || !ALLOWED_PERMISSIONS.has(permission)) {
        return res.status(400).json({
          error: "Valid email and permission ('read' or 'edit') are required"
        });
      }

      client = await pool.connect();

      const documentResult = await client.query(
        "SELECT id, owner_id FROM documents WHERE id = $1 LIMIT 1",
        [id]
      );

      const document = documentResult.rows[0];

      if (
        !document ||
        String(document.owner_id) !== String(actorId)
      ) {
        await writeAudit({
          actorId,
          action: "permission_grant",
          documentId: id,
          outcome: "denied",
          details: {
            reason: "Only the owner can grant permissions"
          }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      const targetResult = await client.query(
        "SELECT id, email FROM users WHERE email = $1 LIMIT 1",
        [email.trim().toLowerCase()]
      );

      const target = targetResult.rows[0];

      if (!target) {
        return res.status(404).json({
          error: "Target user not found"
        });
      }

      if (String(target.id) === String(actorId)) {
        return res.status(400).json({
          error: "You already own this document"
        });
      }

      await client.query("BEGIN");

      try {
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
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

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
      return next(error);
    } finally {
      if (client) client.release();
    }
  }
);

// --------------------------------------------------
// Revoke permission (owner only)
// --------------------------------------------------

app.delete(
  "/api/documents/:id/permissions/:userId",
  requireAuth,
  async (req, res, next) => {
    let client;

    try {
      const { id, userId } = req.params;
      const actorId = req.session.user.id;

      if (!validDocumentId(id) || !validUserId(userId)) {
        return res.status(404).json({
          error: "Document not found"
        });
      }

      client = await pool.connect();

      const documentResult = await client.query(
        "SELECT id, owner_id FROM documents WHERE id = $1 LIMIT 1",
        [id]
      );

      const document = documentResult.rows[0];

      if (
        !document ||
        String(document.owner_id) !== String(actorId)
      ) {
        await writeAudit({
          actorId,
          action: "permission_revoke",
          documentId: id,
          targetUserId: userId,
          outcome: "denied",
          details: {
            reason: "Only the owner can revoke permissions"
          }
        });

        return res.status(404).json({
          error: "Document not found"
        });
      }

      await client.query("BEGIN");

      try {
        const deleted = await client.query(
          `DELETE FROM document_permissions
           WHERE document_id = $1 AND user_id = $2
           RETURNING user_id`,
          [id, userId]
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
          targetUserId: userId,
          outcome: "success",
          db: client
        });

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      return res.json({
        message: "Permission revoked"
      });
    } catch (error) {
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
        return res.status(404).json({
          error: "Document not found"
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
        `SELECT id, storage_key
         FROM documents
         WHERE id = $1 AND owner_id = $2
         FOR UPDATE`,
        [id, actorId]
      );

      if (!result.rows[0]) {
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

      storageKey = result.rows[0].storage_key;

      await client.query(
        "DELETE FROM document_permissions WHERE document_id = $1",
        [id]
      );

      await client.query(
        "DELETE FROM documents WHERE id = $1 AND owner_id = $2",
        [id, actorId]
      );

      await writeAudit({
        actorId,
        action: "document_delete",
        documentId: id,
        outcome: "success",
        details: {
          storageKeyRemovedAfterCommit: true
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
// Admin audit logs
// --------------------------------------------------

app.get(
  "/api/admin/audit-logs",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const requestedLimit = Number(req.query.limit || 100);

      const limit = Number.isInteger(requestedLimit)
        ? Math.max(1, Math.min(requestedLimit, 200))
        : 100;

      const result = await pool.query(
        `SELECT id, actor_id, action, document_id, target_user_id,
                outcome, details, created_at
         FROM audit_logs
         ORDER BY created_at DESC, id DESC
         LIMIT $1`,
        [limit]
      );

      return res.json({
        auditLogs: result.rows
      });
    } catch (error) {
      return next(error);
    }
  }
);

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

app.use((error, _req, res, _next) => {
  if (error === invalidCsrfTokenError) {
    return res.status(403).json({
      error: "Invalid CSRF token"
    });
  }

  if (error instanceof multer.MulterError) {
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
  const port = Number(process.env.PORT || 3000);

  app.listen(port, () => {
    console.log(`TrustVault API listening on port ${port}`);
  });
}

module.exports = app;