require("dotenv").config();

const { Pool } = require("pg");

const usingPostgres = Boolean(process.env.DATABASE_URL);

if (!usingPostgres) {
  module.exports = require("./database");
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  function convertSqliteToPostgres(sql, params = []) {
    let index = 0;

    let convertedSql = sql
      .replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP")
      .replace(/CURRENT_TIMESTAMP/g, "CURRENT_TIMESTAMP")
      .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO");

    convertedSql = convertedSql.replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    });

    return {
      sql: convertedSql,
      params
    };
  }

  const db = {
    usingPostgres: true,

    get(sql, params = [], callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }

      const query = convertSqliteToPostgres(sql, params);

      pool.query(query.sql, query.params)
        .then((result) => {
          callback(null, result.rows[0]);
        })
        .catch((error) => {
          callback(error);
        });
    },

    all(sql, params = [], callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }

      const query = convertSqliteToPostgres(sql, params);

      pool.query(query.sql, query.params)
        .then((result) => {
          callback(null, result.rows);
        })
        .catch((error) => {
          callback(error);
        });
    },

    run(sql, params = [], callback) {
      if (typeof params === "function") {
        callback = params;
        params = [];
      }

      const query = convertSqliteToPostgres(sql, params);

      pool.query(query.sql, query.params)
        .then((result) => {
          const context = {
            lastID: result.rows && result.rows[0] && result.rows[0].id
              ? result.rows[0].id
              : undefined,
            changes: result.rowCount || 0
          };

          if (callback) {
            callback.call(context, null);
          }
        })
        .catch((error) => {
          if (callback) {
            callback(error);
          }
        });
    },

    serialize(callback) {
      callback();
    },

    close(callback) {
      pool.end().then(() => {
        if (callback) callback();
      });
    },

    pool
  };

  module.exports = db;
}