const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./app.db");

db.serialize(() => {
  console.log("Limpando palpites...");
  db.run("DELETE FROM predictions");

  console.log("Limpando usuários...");
  db.run("DELETE FROM users");

  console.log("Resetando IDs...");
  db.run("DELETE FROM sqlite_sequence WHERE name = 'users'");
  db.run("DELETE FROM sqlite_sequence WHERE name = 'predictions'");
});

db.close((error) => {
  if (error) {
    console.error("Erro ao fechar banco:", error.message);
    return;
  }

  console.log("Todos os cadastros e palpites foram apagados com sucesso.");
});