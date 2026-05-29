require("dotenv").config();

const usingPostgres = Boolean(process.env.DATABASE_URL);

if (!usingPostgres) {
  if (process.env.NODE_ENV === "production") {
    console.error("ERRO CRÍTICO: DATABASE_URL não encontrada em produção.");
    process.exit(1);
  }

  console.log("Banco conectado: SQLite local");
  module.exports = require("./database");
} else {
  const { Pool } = require("pg");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  console.log("Banco conectado: Neon PostgreSQL");

  function convertSql(sql, params = []) {
    let index = 0;

    let converted = String(sql)
      .replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP")
      .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
      .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO");

    converted = converted.replace(/\?/g, () => {
      index += 1;
      return "$" + index;
    });

    return { sql: converted, params };
  }

  function addReturningId(sql) {
    const clean = String(sql || "").trim();

    if (/^insert\s+into\s+users\b/i.test(clean) && !/returning\s+id/i.test(clean)) {
      return clean.replace(/;\s*$/, "") + " RETURNING id";
    }

    return clean;
  }

  const db = {
    usingPostgres: true,
    pool,

    get(sql, params = [], callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }

      const query = convertSql(sql, params);

      pool.query(query.sql, query.params)
        .then((result) => callback(null, result.rows[0]))
        .catch((error) => {
          console.error("Postgres db.get error:", error.message);
          console.error("SQL:", query.sql);
          callback(error);
        });
    },

    all(sql, params = [], callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }

      const query = convertSql(sql, params);

      pool.query(query.sql, query.params)
        .then((result) => callback(null, result.rows))
        .catch((error) => {
          console.error("Postgres db.all error:", error.message);
          console.error("SQL:", query.sql);
          callback(error);
        });
    },

    run(sql, params = [], callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }

      let query = convertSql(sql, params);
      query.sql = addReturningId(query.sql);

      pool.query(query.sql, query.params)
        .then((result) => {
          const context = {
            lastID: result.rows && result.rows[0] ? result.rows[0].id : undefined,
            changes: result.rowCount || 0
          };

          if (callback) callback.call(context, null);
        })
        .catch((error) => {
          console.error("Postgres db.run error:", error.message);
          console.error("SQL:", query.sql);
          if (callback) callback(error);
        });
    },

    serialize(callback) {
      callback();
    },

    close(callback) {
      pool.end().then(() => {
        if (callback) callback();
      });
    }
  };

  module.exports = db;
}
