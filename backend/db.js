
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { Pool } = require("pg");

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

let poolConfig = {};

if (rawConnectionString) {
  // Supabase / Managed PostgreSQL unified connection string
  const isSslRequired =
    process.env.DB_SSL === "true" ||
    rawConnectionString.includes("sslmode=") ||
    rawConnectionString.includes("supabase.co") ||
    rawConnectionString.includes("supabase.com") ||
    rawConnectionString.includes("pooler.supabase.com");

  // In cloud/serverless environments (Supabase, Neon, AWS, Vercel), pooler certificates
  // often require rejectUnauthorized: false unless a custom CA is explicitly provided.
  // Explicit DB_SSL_REJECT_UNAUTHORIZED overrides default.
  let rejectUnauthorized = false;
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === "true") {
    rejectUnauthorized = true;
  } else if (process.env.DB_SSL_REJECT_UNAUTHORIZED === "false") {
    rejectUnauthorized = false;
  } else {
    // Default to false for remote Supabase / cloud hosts to avoid SELF_SIGNED_CERT_IN_CHAIN errors
    rejectUnauthorized = false;
  }

  poolConfig = {
    connectionString: rawConnectionString,
    max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
    min: 0,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000),
    maxLifetimeSeconds: 1800,
    ...(isSslRequired
      ? {
          ssl: {
            rejectUnauthorized
          }
        }
      : {})
  };
} else {
  // Discrete environment variables fallback
  const requiredEnv = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];

  const missingEnv = requiredEnv.filter((key) => !process.env[key]);

  if (missingEnv.length > 0) {
    throw new Error(
      `Missing required database configuration. Set DATABASE_URL or provide: ${missingEnv.join(", ")}`
    );
  }

  poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
    min: 0,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 10000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000),
    maxLifetimeSeconds: 1800,

    ...(process.env.DB_SSL === "true"
      ? {
          ssl: {
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true"
          }
        }
      : {})
  };
}

const pool = new Pool(poolConfig);

// Safe, non-secret diagnostic helper
function getSafeDbDiagnostics() {
  if (rawConnectionString) {
    try {
      const parsed = new URL(rawConnectionString);
      return {
        configured: true,
        type: "connection_string",
        protocol: (parsed.protocol || "").replace(":", ""),
        host: parsed.hostname,
        port: parsed.port || "5432",
        database: (parsed.pathname || "").replace(/^\//, ""),
        sslRequired: poolConfig.ssl ? true : false,
        rejectUnauthorized: poolConfig.ssl ? poolConfig.ssl.rejectUnauthorized : false
      };
    } catch (_e) {
      return {
        configured: true,
        type: "connection_string",
        parseError: true
      };
    }
  }

  return {
    configured: Boolean(process.env.DB_HOST),
    type: "discrete_variables",
    host: process.env.DB_HOST || "none",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || "none",
    sslRequired: poolConfig.ssl ? true : false
  };
}

pool.getSafeDbDiagnostics = getSafeDbDiagnostics;

// Prevent unhandled idle-client errors from crashing the process.
// Never log credentials or connection strings.
pool.on("error", () => {
  console.error("Unexpected error from an idle database connection");
});

module.exports = pool;

