const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./app.db", (error) => {
  if (error) {
    console.error("Erro ao conectar no banco:", error.message);
    return;
  }

  console.log("Banco de dados conectado.");
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      first_name TEXT,
      last_name TEXT,
      phone TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`ALTER TABLE users ADD COLUMN first_name TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN last_name TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN phone TEXT UNIQUE`, () => {});

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
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(match_id) REFERENCES matches(id)
    )
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
      FOREIGN KEY(match_id) REFERENCES matches(id)
    )
  `);
});

module.exports = db;