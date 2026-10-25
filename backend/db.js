
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const { Pool } = require("pg");

let poolConfig = {};

if (process.env.DATABASE_URL) {
  // Supabase / Managed PostgreSQL unified connection string
  const isSslRequired =
    process.env.DB_SSL === "true" ||
    process.env.DATABASE_URL.includes("sslmode=") ||
    process.env.DATABASE_URL.includes("supabase.co") ||
    process.env.DATABASE_URL.includes("supabase.com");

  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    maxLifetimeSeconds: 1800,
    ...(isSslRequired
      ? {
          ssl: {
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
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

    max: Number(process.env.DB_POOL_MAX || 10),
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    maxLifetimeSeconds: 1800,

    ...(process.env.DB_SSL === "true"
      ? {
          ssl: {
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
          }
        }
      : {})
  };
}

const pool = new Pool(poolConfig);

// Prevent unhandled idle-client errors from crashing the process.
// Never log credentials or connection strings.
pool.on("error", () => {
  console.error("Unexpected error from an idle database connection");
});

module.exports = pool;

