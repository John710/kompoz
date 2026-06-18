const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || '',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('amazonaws.com')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

async function query(text, params) {
  if (!process.env.DATABASE_URL) {
    throw new Error('Database not configured');
  }
  const res = await pool.query(text, params);
  return res;
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — database features disabled');
    return;
  }

  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    avatar_url VARCHAR(500),
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS network_devices (
    id SERIAL PRIMARY KEY,
    ip INET NOT NULL,
    mac MACADDR,
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'unknown',
    status VARCHAR(20) DEFAULT 'pending',
    online BOOLEAN DEFAULT NULL,
    x FLOAT DEFAULT 0,
    y FLOAT DEFAULT 0,
    notes TEXT,
    check_method VARCHAR(20) DEFAULT 'ping',
    check_target VARCHAR(255),
    properties JSONB DEFAULT '[]',
    ports INTEGER[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS network_links (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES network_devices(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES network_devices(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'ethernet',
    label VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS network_scan_history (
    id SERIAL PRIMARY KEY,
    cidr CIDR NOT NULL,
    found_count INTEGER DEFAULT 0,
    duration_ms INTEGER,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  )`);

  console.log('Database initialized');
}

async function migrateAuth() {
  if (!process.env.DATABASE_URL) return;
  const AUTH_USER = process.env.AUTH_USER || '';
  const AUTH_PASS = process.env.AUTH_PASS || '';
  if (!AUTH_USER || !AUTH_PASS) return;

  const { rows } = await query('SELECT id FROM users WHERE username = $1', [AUTH_USER]);
  if (rows.length > 0) return;

  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(AUTH_PASS, 10);
  await query(
    'INSERT INTO users (username, password_hash, name, is_admin) VALUES ($1, $2, $3, $4)',
    [AUTH_USER, hash, AUTH_USER, true]
  );
  console.log('Migrated auth user:', AUTH_USER);
}

module.exports = { query, initDatabase, migrateAuth, pool };
