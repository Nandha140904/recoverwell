import pkg from 'pg';
const { Pool } = pkg;

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function initDB() {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be provided in .env");
  }

  // If the user specifies port 6543 (pgbouncer), we use it but define a
  // shorter connection timeout to handle the case where it might be down or paused.
  const isPgbouncer = connectionString.includes(":6543");

  const poolConfig = {
    connectionString,
    ssl: { rejectUnauthorized: false }, // Required for Supabase
    connectionTimeoutMillis: envNumber("DB_CONNECTION_TIMEOUT_MS", 10000),
    idleTimeoutMillis: envNumber("DB_IDLE_TIMEOUT_MS", 30000),
    query_timeout: envNumber("DB_QUERY_TIMEOUT_MS", 20000),
    max: envNumber("DB_POOL_MAX", 20),
    keepAlive: true,
  };

  const pool = new Pool(poolConfig);

  console.log(`Connecting to database (${isPgbouncer ? "PgBouncer pooled" : "Direct"})...`);

  // Simple retry wrapper for startup
  let dbHealthy = false;
  for (let i = 0; i < 5; i++) { // Increased to 5 attempts
    try {
      await pool.query("SELECT 1");
      dbHealthy = true;
      break;
    } catch (err) {
      console.error(`DB connection attempt ${i + 1} failed. Retrying in 5s...`, err.message);
      await new Promise(r => setTimeout(r, 5000)); // Increased to 5s wait
    }
  }

  if (!dbHealthy) {
    throw new Error("Could not connect to database after multiple attempts.");
  }

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
      "riskLevel" TEXT DEFAULT 'low',
      "recoveryGuidance" TEXT
    );
  `);

  // Migration for recoveryGuidance
  await pool.query(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='recoveryGuidance') THEN
        ALTER TABLE users ADD COLUMN "recoveryGuidance" TEXT;
      END IF;
    END $$;
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
      "isActive" INTEGER DEFAULT 1,
      "reminderTimes" TEXT,
      "status" TEXT DEFAULT 'active',
      "startDate" TEXT,
      "endDate" TEXT
    );
  `);

  // Migration for new medication columns
  await pool.query(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medications' AND column_name='reminderTimes') THEN
        ALTER TABLE medications ADD COLUMN "reminderTimes" TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medications' AND column_name='status') THEN
        ALTER TABLE medications ADD COLUMN "status" TEXT DEFAULT 'active';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medications' AND column_name='startDate') THEN
        ALTER TABLE medications ADD COLUMN "startDate" TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medications' AND column_name='endDate') THEN
        ALTER TABLE medications ADD COLUMN "endDate" TEXT;
      END IF;
    END $$;
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
