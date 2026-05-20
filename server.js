const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "troque-essa-chave-secreta-depois",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "VocÃª precisa estar logado."
    });
  }

  next();
}

function normalizeGroup(group) {
  return String(group || "").trim().toUpperCase();
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""));
}

app.post("/register", async (req, res) => {
  try {
    const username = req.body.username ? req.body.username.trim() : "";
    const password = req.body.password ? req.body.password : "";

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Informe usuÃ¡rio e senha."
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: "O usuÃ¡rio precisa ter pelo menos 3 caracteres."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "A senha precisa ter pelo menos 6 caracteres."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [username, passwordHash],
      function (error) {
        if (error) {
          console.error("Erro SQLite:", error.message);

          if (error.message.includes("UNIQUE")) {
            return res.status(409).json({
              success: false,
              message: "Esse nome de usuÃ¡rio jÃ¡ existe."
            });
          }

          return res.status(500).json({
            success: false,
            message: "Erro ao criar cadastro."
          });
        }

        req.session.user = {
          id: this.lastID,
          username
        };

        return res.json({
          success: true,
          message: "Cadastro criado com sucesso.",
          user: req.session.user
        });
      }
    );
  } catch (error) {
    console.error("Erro interno no cadastro:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro interno no servidor."
    });
  }
});

app.post("/login", (req, res) => {
  try {
    const username = req.body.username ? req.body.username.trim() : "";
    const password = req.body.password ? req.body.password : "";

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Informe usuÃ¡rio e senha."
      });
    }

    db.get(
      "SELECT * FROM users WHERE username = ?",
      [username],
      async (error, user) => {
        if (error) {
          console.error("Erro SQLite no login:", error.message);

          return res.status(500).json({
            success: false,
            message: "Erro ao buscar usuÃ¡rio."
          });
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            message: "UsuÃ¡rio ou senha invÃ¡lidos."
          });
        }

        const passwordIsCorrect = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!passwordIsCorrect) {
          return res.status(401).json({
            success: false,
            message: "UsuÃ¡rio ou senha invÃ¡lidos."
          });
        }

        req.session.user = {
          id: user.id,
          username: user.username
        };

        return res.json({
          success: true,
          message: "Login realizado com sucesso.",
          user: req.session.user
        });
      }
    );
  } catch (error) {
    console.error("Erro interno no login:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro interno no servidor."
    });
  }
});

app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "UsuÃ¡rio nÃ£o estÃ¡ logado."
    });
  }

  return res.json({
    success: true,
    user: req.session.user
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "Erro ao sair da conta."
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      success: true,
      message: "Logout realizado com sucesso."
    });
  });
});

app.get("/matches", requireLogin, (req, res) => {
  db.all(
    `
      SELECT
        id,
        group_name,
        home_team,
        away_team,
        match_date,
        kickoff_at,
        venue,
        stage
      FROM matches
      WHERE stage = 'Fase de grupos'
      ORDER BY kickoff_at ASC
    `,
    [],
    (error, rows) => {
      if (error) {
        console.error("Erro ao listar jogos:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao listar jogos."
        });
      }

      return res.json({
        success: true,
        matches: rows
      });
    }
  );
});

app.get("/matches/day/:date", requireLogin, (req, res) => {
  const date = String(req.params.date || "").trim();

  if (!isValidDate(date)) {
    return res.status(400).json({
      success: false,
      message: "Data invÃ¡lida. Use o formato YYYY-MM-DD."
    });
  }

  db.all(
    `
      SELECT
        id,
        group_name,
        home_team,
        away_team,
        match_date,
        kickoff_at,
        venue,
        stage
      FROM matches
      WHERE stage = 'Fase de grupos'
        AND match_date = ?
      ORDER BY kickoff_at ASC
    `,
    [date],
    (error, rows) => {
      if (error) {
        console.error("Erro ao listar jogos do dia:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao listar jogos do dia."
        });
      }

      return res.json({
        success: true,
        date,
        matches: rows
      });
    }
  );
});

app.get("/matches/:group", requireLogin, (req, res) => {
  const group = normalizeGroup(req.params.group);

  db.all(
    `
      SELECT
        id,
        group_name,
        home_team,
        away_team,
        match_date,
        kickoff_at,
        venue,
        stage
      FROM matches
      WHERE stage = 'Fase de grupos'
        AND group_name = ?
      ORDER BY kickoff_at ASC
    `,
    [group],
    (error, rows) => {
      if (error) {
        console.error("Erro ao listar jogos do grupo:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao listar jogos do grupo."
        });
      }

      return res.json({
        success: true,
        group,
        matches: rows
      });
    }
  );
});

app.get("/predictions", requireLogin, (req, res) => {
  db.all(
    `
      SELECT
        p.match_id,
        p.home_team,
        p.away_team,
        p.home_score,
        p.away_score,
        p.updated_at,
        m.group_name,
        m.kickoff_at,
        m.venue,
        m.match_date
      FROM predictions p
      LEFT JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC
    `,
    [req.session.user.id],
    (error, rows) => {
      if (error) {
        console.error("Erro ao buscar palpites:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar palpites."
        });
      }

      return res.json({
        success: true,
        predictions: rows
      });
    }
  );
});

app.post("/predictions", requireLogin, (req, res) => {
  const matchId = req.body.matchId ? String(req.body.matchId).trim() : "";
  const homeScore = Number(req.body.homeScore);
  const awayScore = Number(req.body.awayScore);

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "ID do jogo nÃ£o informado."
    });
  }

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return res.status(400).json({
      success: false,
      message: "Informe placares vÃ¡lidos."
    });
  }

  if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
    return res.status(400).json({
      success: false,
      message: "O placar deve estar entre 0 e 99."
    });
  }

  db.get(
    "SELECT * FROM matches WHERE id = ?",
    [matchId],
    (matchError, match) => {
      if (matchError) {
        console.error("Erro ao buscar jogo:", matchError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar jogo."
        });
      }

      if (!match) {
        return res.status(404).json({
          success: false,
          message: "Jogo nÃ£o encontrado."
        });
      }

      const now = new Date();
      const kickoff = new Date(match.kickoff_at);

      if (Number.isNaN(kickoff.getTime())) {
        return res.status(500).json({
          success: false,
          message: "HorÃ¡rio do jogo invÃ¡lido no banco."
        });
      }

      if (now >= kickoff) {
        return res.status(403).json({
          success: false,
          message: "O prazo para salvar esse palpite foi encerrado. O jogo jÃ¡ comeÃ§ou."
        });
      }

      db.run(
        `
          INSERT INTO predictions (
            user_id,
            match_id,
            home_team,
            away_team,
            home_score,
            away_score,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, match_id)
          DO UPDATE SET
            home_team = excluded.home_team,
            away_team = excluded.away_team,
            home_score = excluded.home_score,
            away_score = excluded.away_score,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          req.session.user.id,
          match.id,
          match.home_team,
          match.away_team,
          homeScore,
          awayScore
        ],
        function (error) {
          if (error) {
            console.error("Erro ao salvar palpite:", error.message);

            return res.status(500).json({
              success: false,
              message: "Erro ao salvar palpite."
            });
          }

          return res.json({
            success: true,
            message: "Palpite salvo com sucesso.",
            prediction: {
              matchId: match.id,
              group: match.group_name,
              homeTeam: match.home_team,
              awayTeam: match.away_team,
              homeScore,
              awayScore,
              matchDate: match.match_date,
              kickoffAt: match.kickoff_at
            }
          });
        }
      );
    }
  );
});

app.get("/leaderboard", requireLogin, (req, res) => {
  db.all(
    `
      SELECT
        u.id,
        u.username,
        COUNT(p.id) AS predictions_count,
        COUNT(p.id) AS points
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      GROUP BY u.id, u.username
      ORDER BY points DESC, predictions_count DESC, u.username ASC
      LIMIT 50
    `,
    [],
    (error, rows) => {
      if (error) {
        console.error("Erro ao buscar classificaÃ§Ã£o:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar classificaÃ§Ã£o."
        });
      }

      return res.json({
        success: true,
        leaderboard: rows.map((row, index) => ({
          position: index + 1,
          id: row.id,
          username: row.username,
          predictionsCount: row.predictions_count,
          points: row.points
        }))
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});