const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./app.db", (error) => {
  if (error) {
    console.error("Erro ao conectar no banco:", error.message);
    return;
  }

  console.log("Banco de dados conectado.");
});

function ignoreDuplicateColumn(error) {
  if (!error) return;

  const message = String(error.message || "");

  if (
    message.includes("duplicate column name") ||
    message.includes("already exists")
  ) {
    return;
  }

  console.warn("Aviso ao migrar banco:", message);
}

function runSafe(sql, params = []) {
  db.run(sql, params, ignoreDuplicateColumn);
}

function ensureUsersUsernameNotUnique() {
  db.get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'",
    [],
    (error, row) => {
      if (error) {
        console.warn("Não foi possível verificar schema da tabela users:", error.message);
        return;
      }

      const createSql = String(row && row.sql ? row.sql : "").toLowerCase();

      const usernameStillUnique =
        createSql.includes("username text unique") ||
        createSql.includes("unique(username)") ||
        createSql.includes("unique (username)");

      if (!usernameStillUnique) {
        return;
      }

      console.log("Migrando tabela users para permitir nomes repetidos...");

      db.serialize(() => {
        db.run("PRAGMA foreign_keys = OFF");

        db.run(`
          CREATE TABLE IF NOT EXISTS users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            phone TEXT,
            activation_code TEXT,
            activation_origin TEXT,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          INSERT OR IGNORE INTO users_new (
            id,
            username,
            first_name,
            last_name,
            phone,
            activation_code,
            activation_origin,
            password_hash,
            created_at
          )
          SELECT
            id,
            username,
            first_name,
            last_name,
            phone,
            activation_code,
            activation_origin,
            password_hash,
            created_at
          FROM users
        `);

        db.run("DROP TABLE users");
        db.run("ALTER TABLE users_new RENAME TO users");

        db.run("PRAGMA foreign_keys = ON");

        db.run(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
          ON users(phone)
          WHERE phone IS NOT NULL AND phone != ''
        `);

        console.log("Tabela users migrada com sucesso.");
      });
    }
  );
}

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      activation_code TEXT,
      activation_origin TEXT,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  runSafe(`ALTER TABLE users ADD COLUMN first_name TEXT`);
  runSafe(`ALTER TABLE users ADD COLUMN last_name TEXT`);
  runSafe(`ALTER TABLE users ADD COLUMN phone TEXT`);
  runSafe(`ALTER TABLE users ADD COLUMN activation_code TEXT`);
  runSafe(`ALTER TABLE users ADD COLUMN activation_origin TEXT`);

  runSafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON users(phone)
    WHERE phone IS NOT NULL AND phone != ''
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_users_activation_code
    ON users(activation_code)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_users_activation_origin
    ON users(activation_origin)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      group_name TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      match_date TEXT NOT NULL,
      kickoff_at TEXT NOT NULL,
      venue TEXT,
      stage TEXT DEFAULT 'Fase de grupos'
    )
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_matches_group_name
    ON matches(group_name)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_matches_match_date
    ON matches(match_date)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_matches_kickoff_at
    ON matches(kickoff_at)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id TEXT NOT NULL,
      home_team TEXT,
      away_team TEXT,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, match_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);

  runSafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_user_match_unique
    ON predictions(user_id, match_id)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_predictions_user_id
    ON predictions(user_id)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_predictions_match_id
    ON predictions(match_id)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_predictions_updated_at
    ON predictions(updated_at)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS match_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL UNIQUE,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      finished_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    )
  `);

  runSafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_match_results_match_id_unique
    ON match_results(match_id)
  `);

  runSafe(`
    CREATE INDEX IF NOT EXISTS idx_match_results_updated_at
    ON match_results(updated_at)
  `);

  ensureUsersUsernameNotUnique();
});

module.exports = db;