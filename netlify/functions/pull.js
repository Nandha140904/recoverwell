const { Pool } = require('pg');

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

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const { mobile } = JSON.parse(event.body);
    if (!mobile) return { statusCode: 400, body: JSON.stringify({ error: "Mobile required" }) };

    const db = getPool();
    
    const userRes = await db.query("SELECT * FROM users WHERE mobile = $1", [mobile]);
    const user = userRes.rows[0];
    
    if (!user) {
      return { statusCode: 404, body: JSON.stringify({ error: "User not found" }) };
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

    const parsedMedications = medications.map(m => ({
      ...m,
      isActive: m.isActive === 1,
      reminderTimes: m.reminderTimes ? JSON.parse(m.reminderTimes) : [],
      status: m.status || 'active',
      startDate: m.startDate || null,
      endDate: m.endDate || null
    }));

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
