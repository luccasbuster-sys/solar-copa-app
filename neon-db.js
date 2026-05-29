require("dotenv").config();

const { Pool } = require("pg");

function hasNeonUrl() {
  return Boolean(process.env.DATABASE_URL);
}

let pool = null;

function getNeonPool() {
  if (!hasNeonUrl()) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  return pool;
}

async function testNeonConnection() {
  const neonPool = getNeonPool();

  if (!neonPool) {
    return {
      success: false,
      connected: false,
      message: "DATABASE_URL não encontrada."
    };
  }

  const result = await neonPool.query(`
    SELECT 
      current_database() AS database,
      NOW() AS now
  `);

  return {
    success: true,
    connected: true,
    database: result.rows[0].database,
    now: result.rows[0].now
  };
}

module.exports = {
  hasNeonUrl,
  getNeonPool,
  testNeonConnection
};