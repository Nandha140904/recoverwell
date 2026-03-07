/**
 * RecoverWell — Production API Server
 *
 * Authentication is now password-based (no OTP/SMS required).
 * This server handles:
 *  - Health check endpoint
 *  - Serving the production Vite build as static files in production
 *
 * Password authentication is handled entirely client-side using the
 * Web Crypto API (SHA-256), so no backend calls are needed for auth.
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import { initDB } from "./db.js";

// ── Resolve paths & load .env ─────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, ".env") });

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function isOriginAllowed(origin) {
  return allowedOrigins.size === 0 || allowedOrigins.has(origin);
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || process.env.NODE_ENV !== "production" || isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: false,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Database Initialization ───────────────────────────────────────────────────
let db;
let dbInitError = null;
initDB().then((pool) => {
  db = pool;
  console.log("PostgreSQL initialized");
}).catch(err => {
  dbInitError = err;
  console.error("Failed to init db", err);
});

app.use((err, _req, res, next) => {
  if (err?.message === "Origin not allowed by CORS") {
    res.status(403).json({ error: err.message });
    return;
  }

  next(err);
});

// ── GET /api/pull ────────────────────────────────────────────────────────────
// Fetch the entire recovery profile for a user to sync to a fresh device
app.post("/api/pull", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: "Mobile required" });
  if (dbInitError) return res.status(503).json({ error: "Database unavailable" });
  if (!db) return res.status(503).json({ error: "Database still starting up" });

  try {
    const userRes = await db.query("SELECT * FROM users WHERE mobile = $1", [mobile]);
    const user = userRes.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const docsRes = await db.query("SELECT * FROM documents WHERE mobile = $1", [mobile]);
    const documents = docsRes.rows;

    const healthRes = await db.query('SELECT * FROM "healthEntries" WHERE mobile = $1', [mobile]);
    const healthEntries = healthRes.rows;

    const medsRes = await db.query("SELECT * FROM medications WHERE mobile = $1", [mobile]);
    const medications = medsRes.rows;

    const logsRes = await db.query('SELECT * FROM "medicationLogs" WHERE mobile = $1', [mobile]);
    const medicationLogs = logsRes.rows;

    // Parse specific fields back to arrays
    const parsedDocuments = documents.map(d => ({
      ...d,
      keyFindings: d.keyFindings ? JSON.parse(d.keyFindings) : []
    }));

    const parsedHealthEntries = healthEntries.map(h => ({
      ...h,
      symptoms: h.symptoms ? JSON.parse(h.symptoms) : []
    }));

    // Convert medication booleans
    const parsedMedications = medications.map(m => ({
      ...m,
      isActive: m.isActive === 1
    }));

    // Reconstruct
    const recoveryData = {
      surgeryType: user.surgeryType || "",
      surgeryDate: user.surgeryDate || "",
      currentWeek: user.currentWeek || 0,
      overallProgress: user.overallProgress || 0,
      riskLevel: user.riskLevel || "low",
      healthEntries: parsedHealthEntries,
      documents: parsedDocuments,
      medications: parsedMedications,
      medicationLogs,
      userProfile: {
        mobile: user.mobile,
        name: user.name,
        doctorName: user.doctorName,
        doctorMobile: user.doctorMobile,
        bloodGroup: user.bloodGroup,
        passwordHash: user.passwordHash,
        isLoggedIn: false, // Don't enforce logged-in state purely from DB
        hasUploadedDischarge: user.hasUploadedDischarge === 1
      }
    };

    res.json(recoveryData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to pull data" });
  }
});

// ── POST /api/sync ────────────────────────────────────────────────────────────
// Pushes the entire local browser state to the server to keep it synced
app.post("/api/sync", async (req, res) => {
  const data = req.body;
  if (!data?.userProfile?.mobile) return res.status(400).json({ error: "User missing" });
  if (dbInitError) return res.status(503).json({ error: "Database unavailable" });
  if (!db) return res.status(503).json({ error: "Database still starting up" });

  const mobile = data.userProfile.mobile;
  let client;

  try {
    client = await db.connect();
    await client.query("BEGIN");

    // 1. Upsert User
    await client.query(
      `INSERT INTO users (mobile, name, "doctorName", "doctorMobile", "bloodGroup", "passwordHash", "hasUploadedDischarge", "surgeryType", "surgeryDate", "currentWeek", "overallProgress", "riskLevel")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT(mobile) DO UPDATE SET
         name=EXCLUDED.name, "doctorName"=EXCLUDED."doctorName", "doctorMobile"=EXCLUDED."doctorMobile",
         "bloodGroup"=EXCLUDED."bloodGroup", "passwordHash"=EXCLUDED."passwordHash", "hasUploadedDischarge"=EXCLUDED."hasUploadedDischarge",
         "surgeryType"=EXCLUDED."surgeryType", "surgeryDate"=EXCLUDED."surgeryDate", "currentWeek"=EXCLUDED."currentWeek",
         "overallProgress"=EXCLUDED."overallProgress", "riskLevel"=EXCLUDED."riskLevel"`,
      [
        mobile, data.userProfile.name, data.userProfile.doctorName, data.userProfile.doctorMobile,
        data.userProfile.bloodGroup, data.userProfile.passwordHash, data.userProfile.hasUploadedDischarge ? 1 : 0,
        data.surgeryType, data.surgeryDate, data.currentWeek, data.overallProgress, data.riskLevel
      ]
    );

    // 2. Clear current lists & Insert new
    await client.query("DELETE FROM documents WHERE mobile = $1", [mobile]);
    await client.query('DELETE FROM "healthEntries" WHERE mobile = $1', [mobile]);
    await client.query('DELETE FROM "medicationLogs" WHERE mobile = $1', [mobile]); // logs reference medications
    await client.query("DELETE FROM medications WHERE mobile = $1", [mobile]);

    // Insert Documents
    for (const d of (data.documents || [])) {
      await client.query(
        `INSERT INTO documents (id, mobile, name, type, "uploadDate", summary, "keyFindings", "simplifiedExplanation", status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [d.id, mobile, d.name, d.type, d.uploadDate, d.summary, JSON.stringify(d.keyFindings), d.simplifiedExplanation, d.status]
      );
    }

    // Insert Health Entries
    for (const h of (data.healthEntries || [])) {
      await client.query(
        `INSERT INTO "healthEntries" (id, mobile, date, temperature, weight, "painLevel", symptoms, notes, mood) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [h.id, mobile, h.date, h.temperature, h.weight, h.painLevel, JSON.stringify(h.symptoms), h.notes, h.mood]
      );
    }

    // Insert Medications
    for (const m of (data.medications || [])) {
      await client.query(
        `INSERT INTO medications (id, mobile, name, dosage, frequency, duration, instructions, "isActive") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [m.id, mobile, m.name, m.dosage, m.frequency, m.duration, m.instructions, m.isActive ? 1 : 0]
      );
    }

    // Insert Medication Logs
    for (const log of (data.medicationLogs || [])) {
      await client.query(
        `INSERT INTO "medicationLogs" (id, mobile, "medicationId", date, time, "takenAt") 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [log.id, mobile, log.medicationId, log.date, log.time, log.takenAt]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    console.error(err);
    res.status(500).json({ error: "Failed to sync" });
  } finally {
    client?.release();
  }
});

// ── Serve Vite production build (run `npm run build` first) ───────────────────
const distPath = path.join(__dirname, "..", "dist");

if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("/*splat", (_req, res) => {
    res.sendFile("index.html", { root: distPath });
  });
} else {
  app.get("/*splat", (_req, res) => {
    res.json({ status: "dev", message: "API running. Run `npm run build` to serve the frontend here." });
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  RecoverWell server  →  http://localhost:${PORT}`);
  console.log(`🏥  Health check       →  GET /api/health\n`);
});
