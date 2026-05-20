const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./app.db");

function run(sql) {
  return new Promise((resolve) => {
    db.run(sql, (error) => {
      if (error) {
        console.log(`Aviso: ${error.message}`);
      }
      resolve();
    });
  });
}

async function main() {
  console.log("Iniciando migração da tabela users...");

  await run(`ALTER TABLE users ADD COLUMN first_name TEXT`);
  await run(`ALTER TABLE users ADD COLUMN last_name TEXT`);
  await run(`ALTER TABLE users ADD COLUMN phone TEXT`);

  await run(`
    UPDATE users
    SET first_name = COALESCE(first_name, username),
        last_name = COALESCE(last_name, ''),
        phone = COALESCE(phone, username)
    WHERE first_name IS NULL OR phone IS NULL
  `);

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON users(phone)
  `);

  console.log("Migração concluída. Tabela users agora aceita nome, sobrenome e telefone.");

  db.close();
}

main();