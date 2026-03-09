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
      isActive: m.isActive === 1,
      reminderTimes: m.reminderTimes ? JSON.parse(m.reminderTimes) : [],
      status: m.status || 'active',
      startDate: m.startDate || null,
      endDate: m.endDate || null
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

// ── POST /api/chat ────────────────────────────────────────────────────────────
// Securely proxies chatbot requests to Gemini to protect the API key
app.post("/api/chat", async (req, res) => {
  const { prompt, context } = req.body;
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured on server." });
  }

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    // We use gemini-2.0-flash as the current available model for chatbots
    const systemPrompt = `You are a helpful, professional medical recovery assistant chatbot for a platform called RecoverWell.
Your goal is to provide personalized recovery advice based ONLY on the patient's discharge information and safe medical practices.

CONTEXT:
${context}

RULES:
1. Be encouraging, empathetic, and clear.
2. If a patient asks for medical advice that requires a doctor (e.g., severe pain, signs of infection), strongly advise them to contact their surgeon or emergency services immediately.
3. Keep answers concise and patient-friendly.
4. Use the provided context to answer specific questions about their recovery plan.
5. If you don't know the answer or it's not in the summary, be honest and suggest checking with their medical team.
6. DO NOT provide prescriptions, diagnosis of new conditions, or unsafe medical advice.
7. Use Markdown for formatting (bold, lists).

User Question: ${prompt}
`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      return res.status(response.status).json({ 
        error: errorData?.error?.message || "Failed to get response from AI." 
      });
    }

    const data = await response.json();
    const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that request.";
    
    res.json({ text: botText });
  } catch (err) {
    console.error("Chat Error:", err);
    res.status(500).json({ error: "Internal server error during chat processing." });
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

// ── POST /api/analyse ────────────────────────────────────────────────────────
// Analyzes discharge summaries (PDF/Image) using Gemini
app.post("/api/analyse", async (req, res) => {
  const { fileBase64, mimeType, extraText } = req.body;
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured on server." });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are a clinical pharmacist and recovery specialist AI. 
CRITICAL: Scan EVERY SINGLE PAGE of this document. Do not miss any hidden sections or late-page medication lists.

Tasks:
1. Extract ALL medications listed.
2. Generate comprehensive, personalized recovery guidance based on the diagnosis, surgery, and specific patient details found.

Return ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "medications": [
    {
      "name": "Medication name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. Twice daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take after food",
      "reminderTimes": ["08:00", "20:00"] 
    }
  ],
  "recoveryGuidance": "Markdown formatted recovery advice including: Diet (specific to surgery), Hydration, Exercise limits, Wound care, and Warning signs."
}

Rules for Medications:
- Include tablets, injections, syrups, etc.
- Normalize frequency (BD -> Twice daily, etc.).
- Convert 'reminderTimes' to HH:mm (24h) if mentioned, otherwise provide logical defaults based on frequency.

Rules for Recovery Guidance:
- Use Markdown headers (###).
- Be specific to the surgery mentioned.

If no data is found, return empty fields.`;

    const body = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: fileBase64,
              },
            },
            { text: extraText ? `EXTRACTED TEXT FROM PDF:\n${extraText}\n\n${prompt}` : prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini Analyse Error:", errorData);
      return res.status(response.status).json({ error: errorData?.error?.message || "AI Analysis failed." });
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "AI failed to return valid clinical data." });
    }
    
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("Analyse Exception:", err);
    res.status(500).json({ error: "Internal server error during document analysis." });
  }
});

// ── POST /api/analyse-general ────────────────────────────────────────────────
// Analyzes general medical documents (Lab, Radiology, etc.)
app.post("/api/analyse-general", async (req, res) => {
  const { fileBase64, mimeType, docType } = req.body;
  const apiKey = process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured on server." });
  }

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are an expert medical AI assistant. Analyze this ${docType} document.

Extract the medical information and return ONLY a valid JSON object in this exact format:
{
  "summary": "1-2 sentence medical summary of what this document is about.",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "simplifiedExplanation": "A simple, patient-friendly explanation of what the results mean, avoiding overly complex medical jargon.",
  "medications": [
    {
      "name": "Medication name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. Twice daily / Once daily",
      "duration": "e.g. 5 days",
      "instructions": "e.g. Take after food"
    }
  ]
}

Rules:
- Include all medications found. If none, pass an empty array [].
- Return ONLY the JSON object, absolutely NO markdown formatting or other text.
- If it's hard to read, do your best to extract key points.`;

    const body = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: fileBase64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    };

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini General Analyse Error:", errorData);
      return res.status(response.status).json({ error: errorData?.error?.message || "AI General Analysis failed." });
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "AI failed to return valid medical data." });
    }
    
    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error("General Analyse Exception:", err);
    res.status(500).json({ error: "Internal server error during document analysis." });
  }
});

// ── Local Dev Proxy: /api/fn/* routes mirror Netlify functions ───────────────
// Vite rewrites /.netlify/functions/X → /api/fn/X during local development
app.post("/api/fn/recovery-chat", (req, res, next) => {
  req.url = "/api/chat";
  next();
});

app.post("/api/fn/pull", (req, res, next) => {
  req.url = "/api/pull";
  next();
});

app.post("/api/fn/sync", (req, res, next) => {
  req.url = "/api/sync";
  next();
});

app.post("/api/fn/analyse", (req, res, next) => {
  req.url = "/api/analyse";
  next();
});

app.post("/api/fn/analyse-general", (req, res, next) => {
  req.url = "/api/analyse-general";
  next();
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀  RecoverWell server successfully started`);
  console.log(`🏥  Internal access  →  http://localhost:${PORT}`);
  console.log(`🌐  Remote access    →  http://0.0.0.0:${PORT}`);
  console.log(`📊  Health check      →  GET /api/health\n`);
});
