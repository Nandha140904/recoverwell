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
    max: 1
  });

  return pool;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const { name, doctorName, doctorMobile, bloodGroup, mobile, passwordHash } = JSON.parse(event.body);

    if (!mobile || !passwordHash) {
      return { statusCode: 400, body: JSON.stringify({ error: "Mobile number and password are required." }) };
    }

    const db = getPool();

    // Check if user already exists
    const checkUser = await db.query("SELECT mobile FROM users WHERE mobile = $1", [mobile]);
    if (checkUser.rows.length > 0) {
      return { statusCode: 409, body: JSON.stringify({ error: "An account with this mobile number already exists." }) };
    }

    // Insert user
    await db.query(
      `INSERT INTO users (mobile, name, "doctorName", "doctorMobile", "bloodGroup", "passwordHash", "hasUploadedDischarge")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [mobile, name, doctorName, doctorMobile, bloodGroup, passwordHash, 0]
    );

    return {
      statusCode: 201,
      body: JSON.stringify({ success: true, message: "Account created successfully." })
    };
  } catch (err) {
    console.error("Registration Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Failed to create account in the cloud." })
    };
  }
};
