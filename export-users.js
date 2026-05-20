const sqlite3 = require("sqlite3").verbose();
const ExcelJS = require("exceljs");

const db = new sqlite3.Database("./app.db");

function getWinner(home, away) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function calculatePoints(prediction) {
  if (
    prediction.result_home_score === null ||
    prediction.result_away_score === null
  ) {
    return 0;
  }

  const predictedHome = Number(prediction.pred_home_score);
  const predictedAway = Number(prediction.pred_away_score);
  const realHome = Number(prediction.result_home_score);
  const realAway = Number(prediction.result_away_score);

  const exactScore =
    predictedHome === realHome && predictedAway === realAway;

  if (exactScore) {
    return 35;
  }

  let points = 0;

  const predictedWinner = getWinner(predictedHome, predictedAway);
  const realWinner = getWinner(realHome, realAway);

  if (predictedWinner === realWinner) {
    points += 15;
  }

  if (predictedHome === realHome) {
    points += 5;
  }

  if (predictedAway === realAway) {
    points += 5;
  }

  return points;
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

async function main() {
  const rows = await all(`
    SELECT
      u.id AS user_id,
      u.username,
      u.created_at,
      p.id AS prediction_id,
      p.match_id,
      p.home_score AS pred_home_score,
      p.away_score AS pred_away_score,
      p.updated_at AS prediction_updated_at,
      r.home_score AS result_home_score,
      r.away_score AS result_away_score
    FROM users u
    LEFT JOIN predictions p ON p.user_id = u.id
    LEFT JOIN match_results r ON r.match_id = p.match_id
    ORDER BY u.id ASC, p.updated_at DESC
  `);

  const usersMap = new Map();

  for (const row of rows) {
    if (!usersMap.has(row.user_id)) {
      usersMap.set(row.user_id, {
        id: row.user_id,
        username: row.username,
        createdAt: row.created_at,
        predictionsCount: 0,
        scoredPredictions: 0,
        points: 0,
        lastPredictionAt: null
      });
    }

    const user = usersMap.get(row.user_id);

    if (row.prediction_id) {
      user.predictionsCount += 1;

      if (row.result_home_score !== null && row.result_away_score !== null) {
        user.scoredPredictions += 1;
      }

      user.points += calculatePoints(row);

      if (
        !user.lastPredictionAt ||
        new Date(row.prediction_updated_at) > new Date(user.lastPredictionAt)
      ) {
        user.lastPredictionAt = row.prediction_updated_at;
      }
    }
  }

  const users = Array.from(usersMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.predictionsCount !== a.predictionsCount) {
      return b.predictionsCount - a.predictionsCount;
    }
    return a.username.localeCompare(b.username);
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Solar Copa App";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Usuários cadastrados");

  sheet.columns = [
    { header: "Posição", key: "position", width: 10 },
    { header: "ID", key: "id", width: 10 },
    { header: "Usuário", key: "username", width: 28 },
    { header: "Data de cadastro", key: "createdAt", width: 24 },
    { header: "Palpites salvos", key: "predictionsCount", width: 18 },
    { header: "Palpites pontuados", key: "scoredPredictions", width: 20 },
    { header: "Pontuação", key: "points", width: 14 },
    { header: "Último palpite", key: "lastPredictionAt", width: 24 }
  ];

  users.forEach((user, index) => {
    sheet.addRow({
      position: index + 1,
      id: user.id,
      username: user.username,
      createdAt: user.createdAt || "-",
      predictionsCount: user.predictionsCount,
      scoredPredictions: user.scoredPredictions,
      points: user.points,
      lastPredictionAt: user.lastPredictionAt || "-"
    });
  });

  const header = sheet.getRow(1);
  header.font = {
    bold: true,
    color: { argb: "FFFFFFFF" }
  };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF050505" }
  };
  header.alignment = {
    vertical: "middle",
    horizontal: "center"
  };

  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFCCCCCC" } },
        left: { style: "thin", color: { argb: "FFCCCCCC" } },
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
        right: { style: "thin", color: { argb: "FFCCCCCC" } }
      };

      if (rowNumber > 1) {
        cell.alignment = {
          vertical: "middle"
        };
      }
    });
  });

  sheet.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];

  sheet.autoFilter = {
    from: "A1",
    to: "H1"
  };

  await workbook.xlsx.writeFile("usuarios-cadastrados.xlsx");

  db.close();

  console.log("Planilha criada: usuarios-cadastrados.xlsx");
}

main().catch((error) => {
  console.error("Erro ao gerar planilha:", error.message);
  db.close();
});