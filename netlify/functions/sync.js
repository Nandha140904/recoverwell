const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
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
    const data = JSON.parse(event.body);
    if (!data?.userProfile?.mobile) return { statusCode: 400, body: JSON.stringify({ error: "User missing" }) };

    const db = getPool();
    const client = await db.connect();
    const mobile = data.userProfile.mobile;

    try {
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
      await client.query('DELETE FROM "medicationLogs" WHERE mobile = $1', [mobile]);
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
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Sync Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Failed to sync" })
    };
  }
};
