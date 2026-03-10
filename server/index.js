/**
 * RecoverWell — Production API Server
 *
 * Cloud-based Authentication System (Supabase Backend)
 * This server handles:
 *  - Secure User Registration & Authentication
 *  - Real-time Data Synchronization (Supabase PostgreSQL)
 *  - Medical Document Analysis (Groq AI)
 *  - Health Check & Monitoring
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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// ── Logging Middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Initiating ${req.method} ${req.url}`);
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] Completed ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.use(express.json({ limit: "15mb" })); // Increased for image/PDF analysis payloads

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

// ── POST /api/auth/register ──────────────────────────────────────────────────
// Securely creates a new user account in the cloud (Supabase)
app.post("/api/auth/register", async (req, res) => {
  const { name, doctorName, doctorMobile, bloodGroup, mobile, passwordHash } = req.body;

  if (!mobile || !passwordHash) {
    return res.status(400).json({ error: "Mobile number and password are required." });
  }

  if (dbInitError) return res.status(503).json({ error: "Database unavailable" });
  if (!db) return res.status(503).json({ error: "Database still starting up" });

  try {
    // Check if user already exists
    const checkUser = await db.query("SELECT mobile FROM users WHERE mobile = $1", [mobile]);
    if (checkUser.rows.length > 0) {
      return res.status(409).json({ error: "An account with this mobile number already exists." });
    }

    // Insert user
    await db.query(
      `INSERT INTO users (mobile, name, "doctorName", "doctorMobile", "bloodGroup", "passwordHash", "hasUploadedDischarge")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [mobile, name, doctorName, doctorMobile, bloodGroup, passwordHash, 0]
    );

    res.status(201).json({ success: true, message: "Account created successfully." });
  } catch (err) {
    console.error("Registration Error:", err);
    res.status(500).json({ error: "Failed to create account in the cloud." });
  }
});

// ── GET /api/pull (Secure Login) ─────────────────────────────────────────────
// Validates credentials and fetches the entire recovery profile
app.post("/api/pull", async (req, res) => {
  const { mobile, passwordHash } = req.body;
  if (!mobile) return res.status(400).json({ error: "Mobile required" });
  if (!passwordHash) return res.status(401).json({ error: "Password required for cloud authentication." });

  if (dbInitError) return res.status(503).json({ error: "Database unavailable" });
  if (!db) return res.status(503).json({ error: "Database still starting up" });

  try {
    const userRes = await db.query("SELECT * FROM users WHERE mobile = $1", [mobile]);
    const user = userRes.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: "No account found with this mobile number." });
    }

    // Verify password hash
    if (user.passwordHash !== passwordHash) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    const docsRes = await db.query("SELECT * FROM documents WHERE mobile = $1", [mobile]);
    const medsRes = await db.query("SELECT * FROM medications WHERE mobile = $1", [mobile]);
    const logsRes = await db.query("SELECT * FROM \"medicationLogs\" WHERE mobile = $1", [mobile]);
    const healthRes = await db.query("SELECT * FROM \"healthEntries\" WHERE mobile = $1", [mobile]);
    const chatRes = await db.query("SELECT * FROM \"chat_messages\" WHERE mobile = $1 ORDER BY created_at ASC", [mobile]);

    const documents = docsRes.rows;
    const healthEntries = healthRes.rows;
    const medications = medsRes.rows;
    const medicationLogs = logsRes.rows;
    const chatMessages = chatRes.rows.map(m => ({
      role: m.role === 'assistant' ? 'bot' : 'user',
      content: m.message,
      created_at: m.created_at
    }));

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
      isActive: m.isActive === 1,
      reminderTimes: m.reminderTimes ? JSON.parse(m.reminderTimes) : [],
      status: m.status || 'active',
      startDate: m.startDate || null,
      endDate: m.endDate || null
    }));

    // Reconstruct
    let surgeryType = user.surgeryType || "Post-Surgery Recovery";
    let surgeryDate = user.surgeryDate || "";
    let currentWeek = user.currentWeek || 1;
    let overallProgress = user.overallProgress || 0;

    // Sanitize legacy demo data from cloud
    if (surgeryType === "Total Knee Replacement") {
      surgeryType = "Post-Surgery Recovery";
      surgeryDate = "";
      currentWeek = 1;
      overallProgress = 0;
    }

    const recoveryData = {
      surgeryType,
      surgeryDate,
      currentWeek,
      overallProgress,
      riskLevel: user.riskLevel || "low",
      healthEntries: parsedHealthEntries,
      documents: parsedDocuments,
      medications: parsedMedications,
      medicationLogs,
      chatMessages,
      recoveryGuidance: user.recoveryGuidance,
      userProfile: {
        mobile: user.mobile,
        name: user.name,
        doctorName: user.doctorName,
        doctorMobile: user.doctorMobile,
        bloodGroup: user.bloodGroup,
        passwordHash: user.passwordHash,
        isLoggedIn: false,
        hasUploadedDischarge: user.hasUploadedDischarge === 1
      }
    };

    res.json(recoveryData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to pull data" });
  }
});

// ── POST /api/chat/save ──────────────────────────────────────────────────────
// Saves a single chat message to the cloud database
app.post("/api/chat/save", async (req, res) => {
  const { mobile, passwordHash, role, message } = req.body;

  if (!mobile || !passwordHash || !role || !message) {
    return res.status(400).json({ error: "Missing required fields for chat storage." });
  }

  if (dbInitError) return res.status(503).json({ error: "Database unavailable" });
  if (!db) return res.status(503).json({ error: "Database still starting up" });

  try {
    // Auth Check
    const userRes = await db.query("SELECT \"passwordHash\" FROM users WHERE mobile = $1", [mobile]);
    if (userRes.rows.length === 0 || userRes.rows[0].passwordHash !== passwordHash) {
      return res.status(401).json({ error: "Unauthorized chat storage request." });
    }

    const mappedRole = role === 'bot' ? 'assistant' : 'user';
    await db.query(
      "INSERT INTO chat_messages (mobile, role, message) VALUES ($1, $2, $3)",
      [mobile, mappedRole, message]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Chat Save Error:", err);
    res.status(500).json({ error: "Failed to save message to cloud." });
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
  const passwordHash = data.userProfile.passwordHash;
  
  if (!passwordHash) return res.status(401).json({ error: "Cloud authentication required for sync." });

  let client;

  try {
    client = await db.connect();
    
    // Verify user & password before proceeding
    const authRes = await client.query("SELECT \"passwordHash\" FROM users WHERE mobile = $1", [mobile]);
    if (authRes.rows.length > 0) {
      if (authRes.rows[0].passwordHash !== passwordHash) {
        client.release();
        return res.status(401).json({ error: "Invalid cloud credentials. Sync rejected." });
      }
    }
    // If user doesn't exist yet, we allow the sync (effectively registering them) 
    // though the explicit /api/auth/register is now the primary way.

    await client.query("BEGIN");

// 1. Upsert User
    await client.query(
      `INSERT INTO users (mobile, name, "doctorName", "doctorMobile", "bloodGroup", "passwordHash", "hasUploadedDischarge", "surgeryType", "surgeryDate", "currentWeek", "overallProgress", "riskLevel", "recoveryGuidance")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT(mobile) DO UPDATE SET
         name=EXCLUDED.name, "doctorName"=EXCLUDED."doctorName", "doctorMobile"=EXCLUDED."doctorMobile",
         "bloodGroup"=EXCLUDED."bloodGroup", "passwordHash"=EXCLUDED."passwordHash", "hasUploadedDischarge"=EXCLUDED."hasUploadedDischarge",
         "surgeryType"=EXCLUDED."surgeryType", "surgeryDate"=EXCLUDED."surgeryDate", "currentWeek"=EXCLUDED."currentWeek",
         "overallProgress"=EXCLUDED."overallProgress", "riskLevel"=EXCLUDED."riskLevel", "recoveryGuidance"=EXCLUDED."recoveryGuidance"`,
      [
        mobile, data.userProfile.name, data.userProfile.doctorName, data.userProfile.doctorMobile,
        data.userProfile.bloodGroup, data.userProfile.passwordHash, data.userProfile.hasUploadedDischarge ? 1 : 0,
        data.surgeryType, data.surgeryDate, data.currentWeek, data.overallProgress, data.riskLevel,
        data.recoveryGuidance
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
        `INSERT INTO medications (id, mobile, name, dosage, frequency, duration, instructions, "isActive", "reminderTimes", "status", "startDate", "endDate") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          m.id, mobile, m.name, m.dosage, m.frequency, m.duration, 
          m.instructions, m.isActive ? 1 : 0,
          m.reminderTimes ? JSON.stringify(m.reminderTimes) : null,
          m.status || 'active', m.startDate || null, m.endDate || null
        ]
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

// ── POST /api/ai-chat ────────────────────────────────────────────────────────
// Unified endpoint for AI chatbot and document analysis via Groq
app.post("/api/ai-chat", async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Groq API key not configured on server. Please check your .env file." });
  }

  try {
    const groqUrl = "https://api.groq.com/openai/v1/chat/completions";

    const response = await fetch(groqUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: errorData?.error?.message || "Groq's AI service is currently unavailable." 
      });
    }

    const result = await response.json();
    return res.json(result);
  } catch (err) {
    console.error("ai-chat Exception:", err);
    res.status(500).json({ error: "An unexpected error occurred: " + err.message });
  }
});

// ── Legacy AI Endpoints (Deprecated) ─────────────────────────────────────────
app.post("/api/chat", (req, res) => {
  res.status(400).json({ error: "Endpoint deprecated. Please use /api/ai-chat." });
});
app.post("/api/analyse", (req, res) => {
  res.status(400).json({ error: "Endpoint deprecated. Please use /api/ai-chat." });
});
app.post("/api/analyse-general", (req, res) => {
  res.status(400).json({ error: "Endpoint deprecated. Please use /api/ai-chat." });
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

// ── Local Dev Proxy: /api/fn/* routes mirror Netlify functions ───────────────
// Vite rewrites /.netlify/functions/X → /api/fn/X during local development
import { Router } from "express";
const fnRouter = Router();

// Use simple redirect approach
app.use("/api/fn", (req, res) => {
  const mapping = {
    "/ai-chat": "/api/ai-chat",
    "/pull": "/api/pull",
    "/sync": "/api/sync",
  };
  const target = mapping[req.path];
  if (target) {
    req.url = target;
    req.originalUrl = target;
    app.handle(req, res);
  } else {
    res.status(404).json({ error: "Unknown function" });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀  RecoverWell server successfully started`);
  console.log(`🏥  Internal access  →  http://localhost:${PORT}`);
  console.log(`🌐  Remote access    →  http://0.0.0.0:${PORT}`);
  console.log(`📊  Health check      →  GET /api/health\n`);
});
