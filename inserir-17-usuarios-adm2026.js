const fs = require("fs");
const bcrypt = require("bcrypt");
const neon = require("./neon-db");
const pool = neon.getNeonPool();

const novosUsuarios = [
  ["Larissa Mendes Rocha", "62984621937"],
  ["Rafael Augusto Lima", "62991738452"],
  ["Camila Torres Nunes", "62982370514"],
  ["Bruno Henrique Alves", "62996512840"],
  ["Juliana Costa Ferreira", "62985193726"],
  ["Mateus Ribeiro Santos", "62990274618"],
  ["Patricia Gomes Martins", "62987461593"],
  ["Felipe Andrade Souza", "62993628057"],
  ["Renata Carvalho Dias", "62981549270"],
  ["Thiago Moreira Campos", "62997834105"],
  ["Aline Batista Freitas", "62984276031"],
  ["Marcelo Vieira Lopes", "62991358624"],
  ["Sabrina Oliveira Melo", "62986943072"],
  ["Diego Fernandes Reis", "62994720586"],
  ["Viviane Almeida Castro", "62982569341"],
  ["Caio Barbosa Teixeira", "62995817063"],
  ["Monica Pereira Duarte", "62989134625"]
];

async function main() {
  const backup = await pool.query("SELECT * FROM users ORDER BY created_at DESC");

  fs.writeFileSync(
    "backup-users-antes-inserir-17-adm2026.json",
    JSON.stringify(backup.rows, null, 2),
    "utf8"
  );

  const senhaHash = await bcrypt.hash("adm2026", 10);

  let inseridos = 0;
  let ignorados = 0;

  for (const [username, phone] of novosUsuarios) {
    const partes = username.trim().split(/\s+/);
    const firstName = partes[0];
    const lastName = partes.slice(1).join(" ");

    const result = await pool.query(
      `
        INSERT INTO users (
          username,
          first_name,
          last_name,
          phone,
          password_hash,
          activation_code,
          activation_origin,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (phone) DO NOTHING
        RETURNING id, username, phone
      `,
      [
        username,
        firstName,
        lastName,
        phone,
        senhaHash,
        "ADM2026",
        "Administrativo 2026"
      ]
    );

    if (result.rowCount) {
      inseridos++;
      console.log("Inserido:", username, phone);
    } else {
      ignorados++;
      console.log("Ignorado telefone já existente:", username, phone);
    }
  }

  console.log("Backup criado: backup-users-antes-inserir-17-adm2026.json");
  console.log("Inseridos:", inseridos);
  console.log("Ignorados:", ignorados);
  console.log("Senha padrão:", "adm2026");

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
