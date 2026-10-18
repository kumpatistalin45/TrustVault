
require("dotenv").config();

const { Pool } = require("pg");

const requiredEnv = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD"
];

const missingEnv = requiredEnv.filter(
  (key) => !process.env[key]
);

if (missingEnv.length > 0) {
  throw new Error(
    `Missing required database configuration: ${missingEnv.join(", ")}`
  );
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Resource and connection limits
  max: 10,
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxLifetimeSeconds: 1800,

  // Enable only when the database server supports verified TLS.
  ...(process.env.DB_SSL === "true"
    ? {
        ssl: {
          rejectUnauthorized: true
        }
      }
    : {})
});

// Prevent unhandled idle-client errors from crashing the process.
// Never log credentials or connection strings.
pool.on("error", () => {
  console.error("Unexpected error from an idle database connection");
});

module.exports = pool;
