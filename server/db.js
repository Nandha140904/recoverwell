import pkg from 'pg';
const { Pool } = pkg;

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function initDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be provided in .env");
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Required for Supabase connections
    connectionTimeoutMillis: envNumber("DB_CONNECTION_TIMEOUT_MS", 5000),
    idleTimeoutMillis: envNumber("DB_IDLE_TIMEOUT_MS", 30000),
    query_timeout: envNumber("DB_QUERY_TIMEOUT_MS", 8000),
    statement_timeout: envNumber("DB_STATEMENT_TIMEOUT_MS", 8000),
    keepAlive: true,
    max: envNumber("DB_POOL_MAX", 10),
  });

  // Test connection
  await pool.query("SELECT 1");

  // Create tables using PostgreSQL syntax
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      mobile TEXT PRIMARY KEY,
      name TEXT,
      "doctorName" TEXT,
      "doctorMobile" TEXT,
      "bloodGroup" TEXT,
      "passwordHash" TEXT,
      "hasUploadedDischarge" INTEGER DEFAULT 0,
      "surgeryType" TEXT,
      "surgeryDate" TEXT,
      "currentWeek" INTEGER DEFAULT 0,
      "overallProgress" INTEGER DEFAULT 0,
      "riskLevel" TEXT DEFAULT 'low'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      mobile TEXT REFERENCES users(mobile),
      name TEXT,
      type TEXT,
      "uploadDate" TEXT,
      summary TEXT,
      "keyFindings" TEXT,
      "simplifiedExplanation" TEXT,
      status TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      mobile TEXT REFERENCES users(mobile),
      name TEXT,
      dosage TEXT,
      frequency TEXT,
      duration TEXT,
      instructions TEXT,
      "isActive" INTEGER DEFAULT 1
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "medicationLogs" (
      id TEXT PRIMARY KEY,
      mobile TEXT REFERENCES users(mobile),
      "medicationId" TEXT REFERENCES medications(id),
      date TEXT,
      time TEXT,
      "takenAt" TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "healthEntries" (
      id TEXT PRIMARY KEY,
      mobile TEXT REFERENCES users(mobile),
      date TEXT,
      temperature REAL,
      weight REAL,
      "painLevel" INTEGER,
      symptoms TEXT,
      notes TEXT,
      mood TEXT
    );
  `);

  return pool;
}
