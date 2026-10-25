require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function seed() {
  const hash = await bcrypt.hash('TrustVault@Snovasys#123', 12);
  
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Admin', 'Admin@trustvault.com', $1, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'admin'`,
    [hash]
  );

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Jane Doe (Owner)', 'jane.owner@trustvault.internal', $1, 'owner')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'owner'`,
    [hash]
  );

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Bob Smith (Viewer)', 'bob.viewer@trustvault.internal', $1, 'viewer')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'viewer'`,
    [hash]
  );

  console.log('Seeded demo users successfully');
  await pool.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  pool.end();
});
