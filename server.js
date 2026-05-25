require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Muitas tentativas. Aguarde alguns minutos e tente novamente."
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Muitas tentativas administrativas. Tente novamente mais tarde."
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new SQLiteStore({
      db: "sessions.db",
      dir: "."
    }),
    secret: process.env.SESSION_SECRET || "troque-essa-chave-secreta-depois",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Você precisa estar logado."
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

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone
  };
}

app.post("/register", authLimiter, async (req, res) => {
  try {
    const firstName = req.body.firstName ? req.body.firstName.trim() : "";
    const lastName = req.body.lastName ? req.body.lastName.trim() : "";
    const phone = normalizePhone(req.body.phone);
    const password = req.body.password ? req.body.password : "";

    if (!firstName || !lastName || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Informe nome, sobrenome, telefone e senha."
      });
    }

    if (firstName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "O nome precisa ter pelo menos 2 caracteres."
      });
    }

    if (lastName.length < 2) {
      return res.status(400).json({
        success: false,
        message: "O sobrenome precisa ter pelo menos 2 caracteres."
      });
    }

    if (phone.length < 10 || phone.length > 11) {
      return res.status(400).json({
        success: false,
        message: "Informe um telefone válido com DDD."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "A senha precisa ter pelo menos 6 caracteres."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const username = `${firstName} ${lastName}`;

    db.run(
      `
        INSERT INTO users (
          username,
          first_name,
          last_name,
          phone,
          password_hash
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [username, firstName, lastName, phone, passwordHash],
      function (error) {
        if (error) {
          console.error("Erro SQLite:", error.message);

          if (error.message.includes("UNIQUE")) {
            return res.status(409).json({
              success: false,
              message: "Esse telefone já está cadastrado."
            });
          }

          return res.status(500).json({
            success: false,
            message: "Erro ao criar cadastro.",
            error: error.message
          });
        }

        req.session.user = {
          id: this.lastID,
          username,
          firstName,
          lastName,
          phone
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
      message: "Erro interno no servidor.",
      error: error.message
    });
  }
});

app.post("/login", authLimiter, (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const password = req.body.password ? req.body.password : "";

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Informe telefone e senha."
      });
    }

    db.get(
      "SELECT * FROM users WHERE phone = ?",
      [phone],
      async (error, user) => {
        if (error) {
          console.error("Erro SQLite no login:", error.message);

          return res.status(500).json({
            success: false,
            message: "Erro ao buscar usuário."
          });
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            message: "Telefone ou senha inválidos."
          });
        }

        const passwordIsCorrect = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!passwordIsCorrect) {
          return res.status(401).json({
            success: false,
            message: "Telefone ou senha inválidos."
          });
        }

        req.session.user = publicUser(user);

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
      message: "Erro interno no servidor.",
      error: error.message
    });
  }
});

app.get("/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Usuário não está logado."
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
      message: "Data inválida. Use o formato YYYY-MM-DD."
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
      message: "ID do jogo não informado."
    });
  }

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return res.status(400).json({
      success: false,
      message: "Informe placares válidos."
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
          message: "Jogo não encontrado."
        });
      }

      const now = new Date();
      const kickoff = new Date(match.kickoff_at);

      if (Number.isNaN(kickoff.getTime())) {
        return res.status(500).json({
          success: false,
          message: "Horário do jogo inválido no banco."
        });
      }

      if (now >= kickoff) {
        return res.status(403).json({
          success: false,
          message: "O prazo para salvar esse palpite foi encerrado. O jogo já começou."
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


app.delete("/predictions/:matchId", requireLogin, (req, res) => {
  const matchId = String(req.params.matchId || "").trim();

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "ID do jogo não informado."
    });
  }

  db.get(
    "SELECT * FROM matches WHERE id = ?",
    [matchId],
    (matchError, match) => {
      if (matchError) {
        console.error("Erro ao buscar jogo para reset:", matchError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar jogo."
        });
      }

      if (!match) {
        return res.status(404).json({
          success: false,
          message: "Jogo não encontrado."
        });
      }

      const now = new Date();
      const kickoff = new Date(match.kickoff_at);

      if (Number.isNaN(kickoff.getTime())) {
        return res.status(500).json({
          success: false,
          message: "Horário do jogo inválido no banco."
        });
      }

      if (now >= kickoff) {
        return res.status(403).json({
          success: false,
          message: "O prazo para resetar esse palpite foi encerrado. O jogo já começou."
        });
      }

      db.run(
        "DELETE FROM predictions WHERE user_id = ? AND match_id = ?",
        [req.session.user.id, matchId],
        function (error) {
          if (error) {
            console.error("Erro ao resetar palpite:", error.message);

            return res.status(500).json({
              success: false,
              message: "Erro ao resetar palpite."
            });
          }

          return res.json({
            success: true,
            message: "Palpite resetado com sucesso.",
            deleted: this.changes
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
        u.first_name,
        u.last_name,
        u.phone,
        COUNT(p.id) AS predictions_count,
        COUNT(p.id) AS points
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      GROUP BY u.id, u.username, u.first_name, u.last_name, u.phone
      ORDER BY points DESC, predictions_count DESC, u.username ASC
      LIMIT 50
    `,
    [],
    (error, rows) => {
      if (error) {
        console.error("Erro ao buscar classificação:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar classificação."
        });
      }

      return res.json({
        success: true,
        leaderboard: rows.map((row, index) => ({
          position: index + 1,
          id: row.id,
          username:
            row.first_name && row.last_name
              ? `${row.first_name} ${row.last_name}`
              : row.username,
          phone: row.phone,
          predictionsCount: row.predictions_count,
          points: row.points
        }))
      });
    }
  );
});


// ===== ADMIN DASHBOARD ROUTES =====

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "mktgcs2026";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "2026scgtkm";

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Acesso administrativo não autorizado."
    });
  }

  next();
}

function getPredictionWinner(home, away) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function calculatePredictionPoints(prediction) {
  if (
    prediction.result_home_score === null ||
    prediction.result_away_score === null ||
    prediction.result_home_score === undefined ||
    prediction.result_away_score === undefined
  ) {
    return 0;
  }

  const predictedHome = Number(prediction.pred_home_score);
  const predictedAway = Number(prediction.pred_away_score);
  const realHome = Number(prediction.result_home_score);
  const realAway = Number(prediction.result_away_score);

  if (predictedHome === realHome && predictedAway === realAway) {
    return 35;
  }

  let points = 0;

  const predictedWinner = getPredictionWinner(predictedHome, predictedAway);
  const realWinner = getPredictionWinner(realHome, realAway);

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

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/admin/login", adminLimiter, (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Usuário ou senha de administrador inválidos."
    });
  }

  req.session.admin = {
    username: ADMIN_USERNAME,
    loggedAt: new Date().toISOString()
  };

  return res.json({
    success: true,
    message: "Administrador logado com sucesso.",
    admin: req.session.admin
  });
});

app.get("/admin/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      success: false,
      message: "Administrador não está logado."
    });
  }

  return res.json({
    success: true,
    admin: req.session.admin
  });
});

app.post("/admin/logout", (req, res) => {
  req.session.admin = null;

  return res.json({
    success: true,
    message: "Administrador saiu do dashboard."
  });
});


app.get("/admin/summary", requireAdmin, (req, res) => {
  db.get(
    `
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM predictions) AS total_predictions,
        (SELECT COUNT(*) FROM match_results) AS total_results,
        (SELECT COUNT(*) FROM matches) AS total_matches
    `,
    [],
    (error, row) => {
      if (error) {
        console.error("Erro ao buscar resumo admin:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar resumo administrativo."
        });
      }

      const totalUsers = Number(row.total_users || 0);
      const totalPredictions = Number(row.total_predictions || 0);
      const averagePredictions = totalUsers > 0
        ? Number((totalPredictions / totalUsers).toFixed(2))
        : 0;

      return res.json({
        success: true,
        summary: {
          totalUsers,
          totalPredictions,
          totalResults: Number(row.total_results || 0),
          totalMatches: Number(row.total_matches || 0),
          averagePredictions
        }
      });
    }
  );
});

app.get("/admin/leaderboard", requireAdmin, (req, res) => {
  db.all(
    `
      SELECT
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
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
    `,
    [],
    (error, rows) => {
      if (error) {
        console.error("Erro ao buscar ranking admin:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar ranking administrativo."
        });
      }

      const usersMap = new Map();

      rows.forEach((row) => {
        if (!usersMap.has(row.user_id)) {
          usersMap.set(row.user_id, {
            id: row.user_id,
            username:
              row.first_name && row.last_name
                ? `${row.first_name} ${row.last_name}`
                : row.username,
            firstName: row.first_name,
            lastName: row.last_name,
            phone: row.phone,
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

          if (
            row.result_home_score !== null &&
            row.result_away_score !== null
          ) {
            user.scoredPredictions += 1;
          }

          user.points += calculatePredictionPoints(row);

          if (
            !user.lastPredictionAt ||
            new Date(row.prediction_updated_at) > new Date(user.lastPredictionAt)
          ) {
            user.lastPredictionAt = row.prediction_updated_at;
          }
        }
      });

      const leaderboard = Array.from(usersMap.values())
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.predictionsCount !== a.predictionsCount) {
            return b.predictionsCount - a.predictionsCount;
          }
          return String(a.username || "").localeCompare(String(b.username || ""));
        })
        .map((user, index) => ({
          position: index + 1,
          ...user
        }));

      return res.json({
        success: true,
        leaderboard
      });
    }
  );
});

app.get("/admin/matches/day/:date", requireAdmin, (req, res) => {
  const date = String(req.params.date || "").trim();

  if (!isValidDate(date)) {
    return res.status(400).json({
      success: false,
      message: "Data inválida. Use o formato YYYY-MM-DD."
    });
  }

  db.all(
    `
      SELECT
        m.id,
        m.group_name,
        m.home_team,
        m.away_team,
        m.match_date,
        m.kickoff_at,
        m.venue,
        r.home_score AS result_home_score,
        r.away_score AS result_away_score,
        r.updated_at AS result_updated_at
      FROM matches m
      LEFT JOIN match_results r ON r.match_id = m.id
      WHERE m.stage = 'Fase de grupos'
        AND m.match_date = ?
      ORDER BY m.kickoff_at ASC
    `,
    [date],
    (error, rows) => {
      if (error) {
        console.error("Erro ao buscar jogos do dia admin:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar jogos do dia."
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

app.post("/admin/results", requireAdmin, (req, res) => {
  const matchId = String(req.body.matchId || "").trim();
  const homeScore = Number(req.body.homeScore);
  const awayScore = Number(req.body.awayScore);

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "Informe o ID do jogo."
    });
  }

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return res.status(400).json({
      success: false,
      message: "Informe placares válidos."
    });
  }

  if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
    return res.status(400).json({
      success: false,
      message: "O placar deve estar entre 0 e 99."
    });
  }

  db.get("SELECT id FROM matches WHERE id = ?", [matchId], (matchError, match) => {
    if (matchError) {
      console.error("Erro ao buscar jogo para resultado:", matchError.message);

      return res.status(500).json({
        success: false,
        message: "Erro ao buscar jogo."
      });
    }

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Jogo não encontrado."
      });
    }

    db.run(
      `
        INSERT INTO match_results (
          match_id,
          home_score,
          away_score,
          updated_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(match_id)
        DO UPDATE SET
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          updated_at = CURRENT_TIMESTAMP
      `,
      [matchId, homeScore, awayScore],
      function (error) {
        if (error) {
          console.error("Erro ao salvar resultado:", error.message);

          return res.status(500).json({
            success: false,
            message: "Erro ao salvar resultado."
          });
        }

        return res.json({
          success: true,
          message: "Resultado atualizado com sucesso.",
          result: {
            matchId,
            homeScore,
            awayScore
          }
        });
      }
    );
  });
});

// ===== END ADMIN DASHBOARD ROUTES =====

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});