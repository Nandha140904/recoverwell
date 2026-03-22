import pkg from 'pg';
const { Pool } = pkg;

let pool;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DEBUG: DATABASE_URL is missing in process.env.");
    throw new Error("DATABASE_URL must be provided in environment variables");
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    max: 1 // Keep connections low in serverless environment
  });

  return pool;
}

export const handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const { mobile, passwordHash } = JSON.parse(event.body);
    if (!mobile) return { statusCode: 400, body: JSON.stringify({ error: "Mobile required" }) };
    if (!passwordHash) return { statusCode: 401, body: JSON.stringify({ error: "Password required for cloud authentication." }) };

    const db = getPool();

    const userRes = await db.query("SELECT * FROM users WHERE mobile = $1", [mobile]);
    const user = userRes.rows[0];

    if (!user) {
      return { statusCode: 404, body: JSON.stringify({ error: "No account found with this mobile number." }) };
    }

    // Verify password hash
    if (user.passwordHash !== passwordHash) {
      return { statusCode: 401, body: JSON.stringify({ error: "Incorrect password." }) };
    }

    const docsRes = await db.query("SELECT * FROM documents WHERE mobile = $1", [mobile]);
    const documents = docsRes.rows;

    const healthRes = await db.query('SELECT * FROM "healthEntries" WHERE mobile = $1', [mobile]);
    const healthEntries = healthRes.rows;

    const medsRes = await db.query("SELECT * FROM medications WHERE mobile = $1", [mobile]);
    const medications = medsRes.rows;

    const logsRes = await db.query('SELECT * FROM "medicationLogs" WHERE mobile = $1', [mobile]);
    const medicationLogs = logsRes.rows;

    const chatRes = await db.query('SELECT * FROM "chat_messages" WHERE mobile = $1 ORDER BY created_at ASC', [mobile]);
    const chatMessages = chatRes.rows.map(m => ({
      role: m.role === 'assistant' ? 'bot' : 'user',
      content: m.message,
      created_at: m.created_at
    }));

    const parsedDocuments = documents.map(d => ({
      ...d,
      keyFindings: d.keyFindings ? JSON.parse(d.keyFindings) : []
    }));

    const parsedHealthEntries = healthEntries.map(h => ({
      ...h,
      symptoms: h.symptoms ? JSON.parse(h.symptoms) : []
    }));

    const parsedMedications = medications.map(m => ({
      ...m,
      isActive: m.isActive === 1,
      reminderTimes: m.reminderTimes ? JSON.parse(m.reminderTimes) : [],
      status: m.status || 'active',
      startDate: m.startDate || null,
      endDate: m.endDate || null
    }));

    const recoveryData = {
      surgeryType: user.surgeryType || "Post-Surgery Recovery",
      surgeryDate: user.surgeryDate || "",
      currentWeek: user.currentWeek || 1,
      overallProgress: user.overallProgress || 0,
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

    return {
      statusCode: 200,
      body: JSON.stringify(recoveryData)
    };
  } catch (err) {
    console.error("Pull Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to pull data" })
    };
  }
};
