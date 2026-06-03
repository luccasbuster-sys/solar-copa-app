require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./database");
const ExcelJS = require("exceljs");

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


const ACTIVATION_CODES = {
  CD2026: "Centro de Distribuição",
  ADM2026: "Centro Administrativo",
  TRANS2026: "Solar Transporte",
  S12026: "Posto S1",
  S22026: "Posto S2",
  S32026: "Posto S3",
  S42026: "Posto S4",
  S52026: "Posto S5",
  PREMIUM2026: "Posto Premium",
  TRINDADE2026: "Solar Trindade",
  ROMEIROS2026: "Solar Rodovia dos Romeiros",
  FUTURA2026: "Futura Atacadista"
};

function normalizeActivationCode(code) {
  return String(code || "").trim().toUpperCase();
}

function getActivationOrigin(code) {
  return ACTIVATION_CODES[normalizeActivationCode(code)] || null;
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || ""
  };
}



function parseMatchDateTime(match) {
  if (!match) return null;

  const rawKickoff = String(match.kickoff_at || match.kickoff || "").trim();
  const rawDate = String(match.match_date || match.date || "").trim();

  if (!rawKickoff && !rawDate) {
    return null;
  }

  const candidates = [];

  if (rawKickoff.includes("T")) {
    candidates.push(rawKickoff);
  }

  if (rawDate && /^\d{2}:\d{2}/.test(rawKickoff)) {
    candidates.push(`${rawDate}T${rawKickoff}:00`);
  }

  if (rawDate && /^\d{2}:\d{2}:\d{2}/.test(rawKickoff)) {
    candidates.push(`${rawDate}T${rawKickoff}`);
  }

  if (rawDate && rawKickoff) {
    candidates.push(`${rawDate} ${rawKickoff}`);
  }

  if (rawKickoff) {
    candidates.push(rawKickoff);
  }

  for (const candidate of candidates) {
    const date = new Date(candidate);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}



function normalizeMatchIdForDatabase(matchId) {
  const value = String(matchId || "").trim();

  const aliases = {
    "A-01": "m01",
    "a-01": "m01"
  };

  return aliases[value] || value;
}


function normalizeScoreValue(value) {
  const text = String(value ?? "").trim();

  if (!/^\d{1,2}$/.test(text)) {
    return null;
  }

  const number = Number(text);

  if (!Number.isInteger(number) || number < 0 || number > 99) {
    return null;
  }

  return number;
}


function getExtraActivationCodeOrigin(activationCode) {
  const code = String(activationCode || "").trim().toUpperCase();

  const extraCodes = {
    OUTLET2026: "Outlet 2026",
    TRANSPORTE2026: "Transporte 2026"
  };

  return extraCodes[code] || null;
}


function getActivationCodeOrigin(activationCode) {
  const code = String(activationCode || "").trim().toUpperCase();

  if (!code) {
    return "Público Instagram";
  }

  const extraActivationCodes = {
    OUTLET2026: "Outlet 2026",
    TRANSPORTE2026: "Transporte 2026"
  };

  if (extraActivationCodes[code]) {
    return extraActivationCodes[code];
  }

  if (typeof ACTIVATION_CODES !== "undefined" && ACTIVATION_CODES[code]) {
    return ACTIVATION_CODES[code];
  }

  if (typeof activationCodes !== "undefined" && activationCodes[code]) {
    return activationCodes[code];
  }

  return null;
}

function isActivationCodeAllowed(activationCode) {
  const code = String(activationCode || "").trim().toUpperCase();

  if (!code) {
    return true;
  }

  return Boolean(getActivationCodeOrigin(code));
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
    phone: user.phone,
    activationCode: user.activation_code,
    activationOrigin: user.activation_origin
  };
}



/* ===== CADASTRO PÚBLICO COM CÓDIGO OPCIONAL ===== */
app.post("/register", (req, res) => {
  const fullName = String(req.body.fullName || req.body.name || req.body.username || "").trim();
  const phone = typeof normalizePhone === "function"
    ? normalizePhone(req.body.phone)
    : String(req.body.phone || "").replace(/\D/g, "");

  const password = String(req.body.password || "").trim();
  const activationCode = String(req.body.activationCode || "").trim().toUpperCase();

  
  // Código de ativação liberado para campanha Outlet
  if (activationCode === "OUTLET2026") {
    try {
      if (typeof ACTIVATION_CODES !== "undefined") {
        ACTIVATION_CODES.OUTLET2026 = "Outlet 2026";
      }

      if (typeof activationCodes !== "undefined") {
        activationCodes.OUTLET2026 = "Outlet 2026";
      }
    } catch (error) {
      console.warn("Não foi possível registrar OUTLET2026:", error.message);
    }
  }
const codeMap = typeof ACTIVATION_CODES !== "undefined"
    ? ACTIVATION_CODES
    : typeof activationCodes !== "undefined"
      ? activationCodes
      : {};

  if (!fullName || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: "Informe nome e sobrenome, telefone e senha."
    });
  }

  if (activationCode && !codeMap[activationCode]) {
    return res.status(400).json({
      success: false,
      message: "Código de ativação inválido."
    });
  }

  const activationOrigin = activationCode ? codeMap[activationCode] : "Público Instagram";

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = nameParts.shift() || fullName;
  const lastName = nameParts.join(" ");

  db.get(
    "SELECT id FROM users WHERE phone = ?",
    [phone],
    (findError, existingUser) => {
      if (findError) {
        console.error("Erro ao verificar telefone:", findError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao verificar cadastro."
        });
      }

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Esse telefone já está cadastrado."
        });
      }

      bcrypt.hash(password, 10, (hashError, passwordHash) => {
        if (hashError) {
          console.error("Erro ao gerar senha:", hashError.message);

          return res.status(500).json({
            success: false,
            message: "Erro ao criar senha."
          });
        }

        db.run(
          `
            INSERT INTO users (
              username,
              first_name,
              last_name,
              phone,
              activation_code,
              activation_origin,
              password_hash,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
          [
            fullName,
            firstName,
            lastName,
            phone,
            activationCode || null,
            activationOrigin,
            passwordHash
          ],
          function (insertError) {
            if (insertError) {
              console.error("Erro ao criar cadastro:", insertError.message);

              return res.status(500).json({
                success: false,
                message: "Erro ao criar cadastro."
              });
            }

            const user = {
              id: this.lastID,
              username: fullName,
              firstName,
              lastName,
              phone,
              activationCode: activationCode || "",
              activationOrigin
            };

            saveUserToNeonIfAvailable({
              username: fullName,
              firstName,
              lastName,
              phone,
              activationCode: activationCode || null,
              activationOrigin,
              passwordHash
            });

            req.session.user = user;

            return res.json({
              success: true,
              message: "Cadastro criado com sucesso.",
              user
            });
          }
        );
      });
    }
  );
});


app.post("/register", authLimiter, async (req, res) => {
  try {
    const fullName = req.body.fullName ? req.body.fullName.trim() : "";
    const phone = normalizePhone(req.body.phone);
    const password = req.body.password ? req.body.password : "";
    const activationCode = normalizeActivationCode(req.body.activationCode);
    const activationOrigin = getActivationOrigin(activationCode);

    const nameParts = splitFullName(fullName);
    const firstName = nameParts.firstName;
    const lastName = nameParts.lastName;

    if (!fullName || !phone || !password || !activationCode) {
      return res.status(400).json({
        success: false,
        message: "Informe nome e sobrenome, telefone, senha e código de ativação."
      });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Informe nome e sobrenome completos."
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

    if (!activationOrigin) {
      return res.status(400).json({
        success: false,
        message: "Código de ativação inválido."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const username = fullName;

    db.run(
      `
        INSERT INTO users (
          username,
          first_name,
          last_name,
          phone,
          activation_code,
          activation_origin,
          password_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        username,
        firstName,
        lastName,
        phone,
        activationCode,
        activationOrigin,
        passwordHash
      ],
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
          phone,
          activationCode,
          activationOrigin
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


app.post("/login", (req, res) => {
  const phone = typeof normalizePhone === "function"
    ? normalizePhone(req.body.phone)
    : String(req.body.phone || "").replace(/\D/g, "");

  const password = String(req.body.password || "").trim();

  if (!phone || !password) {
    return res.status(400).json({
      success: false,
      message: "Informe telefone e senha."
    });
  }

  function finishLoginWithUser(userRow, source) {
    bcrypt.compare(password, userRow.password_hash, (compareError, isValid) => {
      if (compareError) {
        console.error("Erro ao validar senha:", compareError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao validar login."
        });
      }

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Telefone ou senha inválidos."
        });
      }

      const user = {
        id: userRow.id,
        username: userRow.username,
        firstName: userRow.first_name,
        lastName: userRow.last_name,
        phone: userRow.phone,
        activationCode: userRow.activation_code,
        activationOrigin: userRow.activation_origin,
        source
      };

      req.session.user = user;

      return res.json({
        success: true,
        message: "Login realizado com sucesso.",
        user
      });
    });
  }

  db.get(
    "SELECT id, username, first_name, last_name, phone, activation_code, activation_origin, password_hash FROM users WHERE phone = ?",
    [phone],
    async (error, userRow) => {
      if (error) {
        console.error("Erro ao buscar usuário no banco principal:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar usuário."
        });
      }

      if (userRow) {
        return finishLoginWithUser(userRow, "sqlite");
      }

      const neonUser = await findUserInNeonByPhone(phone);

      if (!neonUser) {
        return res.status(401).json({
          success: false,
          message: "Telefone ou senha inválidos."
        });
      }

      return finishLoginWithUser(neonUser, "neon");
    }
  );
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


/* ===== GET PREDICTIONS COM FALLBACK NEON ===== */
app.get("/predictions", requireLogin, async (req, res) => {
  const userId = req.session.user && req.session.user.id;
  const phone = String(req.session.user && req.session.user.phone || "").replace(/\D/g, "");

  function formatPredictions(rows) {
    return rows.map((row) => ({
      id: row.id,
      matchId: row.match_id,
      match_id: row.match_id,
      homeTeam: row.home_team,
      awayTeam: row.away_team,
      homeScore: Number(row.home_score),
      awayScore: Number(row.away_score),
      home_score: Number(row.home_score),
      away_score: Number(row.away_score),
      savedAt: row.updated_at || row.created_at,
      updatedAt: row.updated_at || row.created_at
    }));
  }

  async function loadFromNeon() {
    try {
      const neon = require("./neon-db");
      const pool = neon.getNeonPool();

      if (!pool || !phone) {
        return [];
      }

      const userResult = await pool.query(
        `
          SELECT id
          FROM users
          WHERE phone = $1
          LIMIT 1
        `,
        [phone]
      );

      if (!userResult.rows.length) {
        return [];
      }

      const predictionsResult = await pool.query(
        `
          SELECT
            p.id,
            p.match_id,
            p.home_team,
            p.away_team,
            p.home_score,
            p.away_score,
            p.created_at,
            p.updated_at
          FROM predictions p
          WHERE p.user_id = $1
          ORDER BY p.updated_at DESC, p.created_at DESC
        `,
        [userResult.rows[0].id]
      );

      return predictionsResult.rows;
    } catch (error) {
      console.error("Erro ao carregar palpites do Neon:", error.message);
      return [];
    }
  }

  db.all(
    `
      SELECT
        id,
        match_id,
        home_team,
        away_team,
        home_score,
        away_score,
        created_at,
        updated_at
      FROM predictions
      WHERE user_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `,
    [userId],
    async (error, rows) => {
      if (error) {
        console.error("Erro ao carregar palpites do banco principal:", error.message);

        const neonRows = await loadFromNeon();

        return res.json({
          success: true,
          source: "neon-fallback-after-error",
          predictions: formatPredictions(neonRows)
        });
      }

      if (rows && rows.length) {
        return res.json({
          success: true,
          source: "primary",
          predictions: formatPredictions(rows)
        });
      }

      const neonRows = await loadFromNeon();

      return res.json({
        success: true,
        source: "neon",
        predictions: formatPredictions(neonRows)
      });
    }
  );
});
/* ===== FIM GET PREDICTIONS COM FALLBACK NEON ===== */


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
  const homeScore = normalizeScoreValue(req.body.homeScore);
    const awayScore = normalizeScoreValue(req.body.awayScore);

    if (homeScore === null || awayScore === null) {
      return res.status(400).json({
        success: false,
        message: "O placar deve ter no máximo 2 dígitos por seleção."
      });
    }

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
    async (matchError, match) => {
      if (matchError) {
        console.error("Erro ao buscar jogo:", matchError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar jogo."
        });
      }

      if (!match) {
        const neonFallback = await savePredictionOnlyInNeonIfAvailable({
          phone: req.session.user && req.session.user.phone,
          matchId,
          homeScore,
          awayScore
        });

        if (neonFallback.success) {
          return res.json({
            success: true,
            message: "Palpite salvo com sucesso.",
            prediction: {
              matchId: neonFallback.matchId,
              homeScore: neonFallback.homeScore,
              awayScore: neonFallback.awayScore
            }
          });
        }

        return res.status(404).json({
          success: false,
          message: neonFallback.message || "Jogo não encontrado."
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


app.delete("/predictions/:matchId", requireLogin, async (req, res) => {
  const userId = req.session.user && req.session.user.id;
  const phone = req.session.user && req.session.user.phone;
  const matchId = String(req.params.matchId || "").trim();

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "Jogo inválido."
    });
  }

  const matchIds = Array.from(new Set([
    matchId,
    matchId === "A-01" ? "m01" : null,
    matchId === "m01" ? "A-01" : null
  ].filter(Boolean)));

  const neonResult = await deletePredictionFromNeonIfAvailable({
    phone,
    matchId
  });

  db.run(
    `
      DELETE FROM predictions
      WHERE user_id = ?
        AND match_id IN (${matchIds.map(() => "?").join(",")})
    `,
    [userId, ...matchIds],
    function (error) {
      if (error) {
        console.error("Erro ao resetar palpite no banco principal:", error.message);

        if (neonResult.success) {
          return res.json({
            success: true,
            message: "Palpite resetado com sucesso.",
            deletedFromNeon: neonResult.deleted,
            deletedFromPrimary: 0
          });
        }

        return res.status(500).json({
          success: false,
          message: "Erro ao resetar palpite."
        });
      }

      return res.json({
        success: true,
        message: "Palpite resetado com sucesso.",
        deletedFromNeon: neonResult.deleted || 0,
        deletedFromPrimary: this.changes || 0
      });
    }
  );
});

app.get("/leaderboard", requireLogin, (req, res) => {
  db.all(
    `
      SELECT
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
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
        console.error("Erro ao buscar classificação:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar classificação."
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
            phone: row.phone,
            predictionsCount: 0,
            points: 0,
            lastPredictionAt: null
          });
        }

        const user = usersMap.get(row.user_id);

        if (row.prediction_id) {
          user.predictionsCount += 1;
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
  /*
    Regra de pontuação:
    - Todo palpite salvo vale 1 ponto de participação.
    - Placar exato vale +35 pontos.
    - Acertou vencedor ou empate vale +15 pontos.
    - Acertou gols de cada time vale +5 pontos por time.
  */

  let points = 1;

  if (
    prediction.result_home_score === null ||
    prediction.result_away_score === null ||
    prediction.result_home_score === undefined ||
    prediction.result_away_score === undefined
  ) {
    return points;
  }

  const predictedHome = Number(prediction.pred_home_score);
  const predictedAway = Number(prediction.pred_away_score);
  const realHome = Number(prediction.result_home_score);
  const realAway = Number(prediction.result_away_score);

  if (predictedHome === realHome && predictedAway === realAway) {
    return points + 35;
  }

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





app.delete("/admin/users/:id", requireAdmin, (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de usuário inválido."
    });
  }

  db.get(
    "SELECT id, username, first_name, last_name, phone FROM users WHERE id = ?",
    [userId],
    (findError, user) => {
      if (findError) {
        console.error("Erro ao buscar usuário para exclusão:", findError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar usuário."
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Usuário não encontrado."
        });
      }

      db.serialize(() => {
        db.run(
          "DELETE FROM predictions WHERE user_id = ?",
          [userId],
          function (predictionsError) {
            if (predictionsError) {
              console.error("Erro ao excluir palpites do usuário:", predictionsError.message);

              return res.status(500).json({
                success: false,
                message: "Erro ao excluir palpites do usuário."
              });
            }

            const deletedPredictions = this.changes || 0;

            db.run(
              "DELETE FROM users WHERE id = ?",
              [userId],
              function (userError) {
                if (userError) {
                  console.error("Erro ao excluir usuário:", userError.message);

                  return res.status(500).json({
                    success: false,
                    message: "Erro ao excluir usuário."
                  });
                }

                return res.json({
                  success: true,
                  message: "Usuário excluído com sucesso.",
                  deletedUser: {
                    id: user.id,
                    username:
                      user.first_name && user.last_name
                        ? `${user.first_name} ${user.last_name}`
                        : user.username,
                    phone: user.phone
                  },
                  deletedPredictions
                });
              }
            );
          }
        );
      });
    }
  );
});

app.get("/admin/export-users", requireAdmin, (req, res) => {
  db.all(
    `
      SELECT
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_code,
        u.activation_origin,
        u.created_at,

        p.id AS prediction_id,
        p.match_id,
        p.home_team AS prediction_home_team,
        p.away_team AS prediction_away_team,
        p.home_score AS pred_home_score,
        p.away_score AS pred_away_score,
        p.updated_at AS prediction_updated_at,

        m.group_name,
        m.home_team AS match_home_team,
        m.away_team AS match_away_team,
        m.match_date,
        m.kickoff_at,
        m.venue,
        m.stage,

        r.home_score AS result_home_score,
        r.away_score AS result_away_score,
        r.updated_at AS result_updated_at
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      LEFT JOIN matches m ON m.id = p.match_id
      LEFT JOIN match_results r ON r.match_id = p.match_id
      ORDER BY u.id ASC, p.updated_at DESC
    `,
    [],
    async (error, rows) => {
      if (error) {
        console.error("Erro ao exportar usuários:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao exportar usuários."
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
            m.stage,
            r.home_score AS result_home_score,
            r.away_score AS result_away_score,
            r.updated_at AS result_updated_at
          FROM matches m
          LEFT JOIN match_results r ON r.match_id = m.id
          ORDER BY m.kickoff_at ASC
        `,
        [],
        async (matchesError, matchesRows) => {
          if (matchesError) {
            console.error("Erro ao exportar jogos:", matchesError.message);

            return res.status(500).json({
              success: false,
              message: "Erro ao exportar jogos."
            });
          }

          const usersMap = new Map();
          const predictionRows = [];

          rows.forEach((row) => {
            if (!usersMap.has(row.user_id)) {
              usersMap.set(row.user_id, {
                id: row.user_id,
                username:
                  row.first_name && row.last_name
                    ? `${row.first_name} ${row.last_name}`
                    : row.username,
                phone: row.phone || "-",
                activationCode: row.activation_code || "-",
                activationOrigin: row.activation_origin || "-",
                createdAt: row.created_at || "-",
                predictionsCount: 0,
                scoredPredictions: 0,
                points: 0,
                lastPredictionAt: null
              });
            }

            const user = usersMap.get(row.user_id);

            if (row.prediction_id) {
              const points = calculatePredictionPoints(row);

              user.predictionsCount += 1;
              user.points += points;

              if (
                row.result_home_score !== null &&
                row.result_away_score !== null
              ) {
                user.scoredPredictions += 1;
              }

              if (
                !user.lastPredictionAt ||
                new Date(row.prediction_updated_at) > new Date(user.lastPredictionAt)
              ) {
                user.lastPredictionAt = row.prediction_updated_at;
              }

              predictionRows.push({
                userId: row.user_id,
                username: user.username,
                phone: user.phone,
                activationCode: user.activationCode,
                activationOrigin: user.activationOrigin,
                matchId: row.match_id,
                groupName: row.group_name || "-",
                homeTeam: row.match_home_team || row.prediction_home_team || "-",
                awayTeam: row.match_away_team || row.prediction_away_team || "-",
                matchDate: row.match_date || "-",
                kickoffAt: row.kickoff_at || "-",
                prediction: `${row.pred_home_score} x ${row.pred_away_score}`,
                result:
                  row.result_home_score !== null && row.result_away_score !== null
                    ? `${row.result_home_score} x ${row.result_away_score}`
                    : "Resultado pendente",
                points,
                predictionUpdatedAt: row.prediction_updated_at || "-"
              });
            }
          });

          const users = Array.from(usersMap.values())
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

          const originMap = new Map();

          users.forEach((user) => {
            const key = user.activationOrigin || "Sem origem";

            if (!originMap.has(key)) {
              originMap.set(key, {
                activationOrigin: key,
                usersCount: 0,
                predictionsCount: 0,
                scoredPredictions: 0,
                points: 0
              });
            }

            const item = originMap.get(key);
            item.usersCount += 1;
            item.predictionsCount += user.predictionsCount;
            item.scoredPredictions += user.scoredPredictions;
            item.points += user.points;
          });

          const originRows = Array.from(originMap.values()).sort((a, b) => {
            if (b.usersCount !== a.usersCount) return b.usersCount - a.usersCount;
            return String(a.activationOrigin).localeCompare(String(b.activationOrigin));
          });

          const totalUsers = users.length;
          const totalPredictions = predictionRows.length;
          const totalMatches = matchesRows.length;
          const totalResults = matchesRows.filter(
            (match) => match.result_home_score !== null && match.result_away_score !== null
          ).length;

          const workbook = new ExcelJS.Workbook();
          workbook.creator = "Solar Copa App";
          workbook.created = new Date();

          function styleSheet(sheet) {
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

                cell.alignment = {
                  vertical: "middle",
                  wrapText: true
                };

                if (rowNumber > 1 && rowNumber % 2 === 0) {
                  cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFF7F7F7" }
                  };
                }
              });
            });

            sheet.views = [{ state: "frozen", ySplit: 1 }];
          }

          const summarySheet = workbook.addWorksheet("Resumo Geral");

          summarySheet.columns = [
            { header: "Indicador", key: "label", width: 34 },
            { header: "Valor", key: "value", width: 24 }
          ];

          summarySheet.addRows([
            { label: "Data da exportação", value: new Date().toLocaleString("pt-BR") },
            { label: "Total de usuários", value: totalUsers },
            { label: "Total de palpites", value: totalPredictions },
            { label: "Total de jogos cadastrados", value: totalMatches },
            { label: "Jogos com resultado lançado", value: totalResults },
            { label: "Média de palpites por usuário", value: totalUsers > 0 ? Number((totalPredictions / totalUsers).toFixed(2)) : 0 },
            { label: "Regra: placar exato", value: "35 pontos" },
            { label: "Regra: vencedor ou empate correto", value: "15 pontos" },
            { label: "Regra: gols corretos por time", value: "5 pontos por time" }
          ]);

          styleSheet(summarySheet);

          const rankingSheet = workbook.addWorksheet("Classificação");

          rankingSheet.columns = [
            { header: "Posição", key: "position", width: 10 },
            { header: "Usuário", key: "username", width: 32 },
            { header: "Telefone", key: "phone", width: 18 },
            { header: "Origem", key: "activationOrigin", width: 34 },
            { header: "Código", key: "activationCode", width: 18 },
            { header: "Pontuação", key: "points", width: 14 },
            { header: "Palpites salvos", key: "predictionsCount", width: 18 },
            { header: "Palpites pontuados", key: "scoredPredictions", width: 22 },
            { header: "Último palpite", key: "lastPredictionAt", width: 24 }
          ];

          users.forEach((user) => rankingSheet.addRow(user));
          styleSheet(rankingSheet);
          rankingSheet.autoFilter = { from: "A1", to: "I1" };

          const usersSheet = workbook.addWorksheet("Usuários Cadastrados");

          usersSheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Usuário", key: "username", width: 32 },
            { header: "Telefone", key: "phone", width: 18 },
            { header: "Código de ativação", key: "activationCode", width: 22 },
            { header: "Origem", key: "activationOrigin", width: 34 },
            { header: "Data de cadastro", key: "createdAt", width: 24 }
          ];

          users
            .sort((a, b) => a.id - b.id)
            .forEach((user) => usersSheet.addRow(user));

          styleSheet(usersSheet);
          usersSheet.autoFilter = { from: "A1", to: "F1" };

          const predictionsSheet = workbook.addWorksheet("Palpites Detalhados");

          predictionsSheet.columns = [
            { header: "Usuário", key: "username", width: 32 },
            { header: "Telefone", key: "phone", width: 18 },
            { header: "Origem", key: "activationOrigin", width: 34 },
            { header: "Jogo", key: "matchId", width: 14 },
            { header: "Grupo", key: "groupName", width: 12 },
            { header: "Mandante", key: "homeTeam", width: 24 },
            { header: "Visitante", key: "awayTeam", width: 24 },
            { header: "Data", key: "matchDate", width: 16 },
            { header: "Horário", key: "kickoffAt", width: 24 },
            { header: "Palpite", key: "prediction", width: 14 },
            { header: "Resultado", key: "result", width: 20 },
            { header: "Pontos", key: "points", width: 12 },
            { header: "Atualizado em", key: "predictionUpdatedAt", width: 24 }
          ];

          predictionRows.forEach((prediction) => predictionsSheet.addRow(prediction));
          styleSheet(predictionsSheet);
          predictionsSheet.autoFilter = { from: "A1", to: "M1" };

          const matchesSheet = workbook.addWorksheet("Jogos da Copa");

          matchesSheet.columns = [
            { header: "ID", key: "id", width: 14 },
            { header: "Grupo", key: "group_name", width: 12 },
            { header: "Mandante", key: "home_team", width: 24 },
            { header: "Visitante", key: "away_team", width: 24 },
            { header: "Data", key: "match_date", width: 16 },
            { header: "Horário", key: "kickoff_at", width: 24 },
            { header: "Estádio", key: "venue", width: 42 },
            { header: "Fase", key: "stage", width: 20 }
          ];

          matchesRows.forEach((match) => matchesSheet.addRow(match));
          styleSheet(matchesSheet);
          matchesSheet.autoFilter = { from: "A1", to: "H1" };

          const resultsSheet = workbook.addWorksheet("Resultados Lançados");

          resultsSheet.columns = [
            { header: "ID do jogo", key: "id", width: 14 },
            { header: "Grupo", key: "group_name", width: 12 },
            { header: "Mandante", key: "home_team", width: 24 },
            { header: "Visitante", key: "away_team", width: 24 },
            { header: "Resultado", key: "result", width: 18 },
            { header: "Atualizado em", key: "result_updated_at", width: 24 }
          ];

          matchesRows
            .filter((match) => match.result_home_score !== null && match.result_away_score !== null)
            .forEach((match) => {
              resultsSheet.addRow({
                id: match.id,
                group_name: match.group_name,
                home_team: match.home_team,
                away_team: match.away_team,
                result: `${match.result_home_score} x ${match.result_away_score}`,
                result_updated_at: match.result_updated_at || "-"
              });
            });

          styleSheet(resultsSheet);
          resultsSheet.autoFilter = { from: "A1", to: "F1" };

          const originSheet = workbook.addWorksheet("Resumo por Origem");

          originSheet.columns = [
            { header: "Origem", key: "activationOrigin", width: 34 },
            { header: "Usuários", key: "usersCount", width: 14 },
            { header: "Palpites", key: "predictionsCount", width: 14 },
            { header: "Palpites pontuados", key: "scoredPredictions", width: 20 },
            { header: "Pontos totais", key: "points", width: 16 }
          ];

          originRows.forEach((origin) => originSheet.addRow(origin));
          styleSheet(originSheet);
          originSheet.autoFilter = { from: "A1", to: "E1" };

          const buffer = await workbook.xlsx.writeBuffer();
          const fileName = `relatorio-solar-copa-${new Date().toISOString().slice(0, 10)}.xlsx`;

          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );

          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
          );

          return res.send(Buffer.from(buffer));
        }
      );
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
  const matchId = normalizeMatchIdForDatabase(req.body.matchId);
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

  db.get("SELECT id FROM matches WHERE id = ?", [matchId], async (matchError, match) => {
    if (matchError) {
      console.error("Erro ao buscar jogo para resultado:", matchError.message);

      return res.status(500).json({
        success: false,
        message: "Erro ao buscar jogo."
      });
    }

    if (!match) {
        const neonFallback = await savePredictionOnlyInNeonIfAvailable({
          phone: req.session.user && req.session.user.phone,
          matchId,
          homeScore,
          awayScore
        });

        if (neonFallback.success) {
          return res.json({
            success: true,
            message: "Palpite salvo com sucesso.",
            prediction: {
              matchId: neonFallback.matchId,
              homeScore: neonFallback.homeScore,
              awayScore: neonFallback.awayScore
            }
          });
        }

        return res.status(404).json({
          success: false,
          message: neonFallback.message || "Jogo não encontrado."
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






app.get("/admin/summary", requireAdmin, (req, res) => {
  const summary = {
    users: 0,
    predictions: 0,
    results: 0,
    averagePerUser: 0
  };

  db.get("SELECT COUNT(*) AS total FROM users", [], (usersError, usersRow) => {
    if (usersError) {
      console.error("Erro ao contar usuários:", usersError.message);
      return res.status(500).json({ success: false, message: "Erro ao contar usuários." });
    }

    summary.users = Number(usersRow?.total || 0);

    db.get("SELECT COUNT(*) AS total FROM predictions", [], (predictionsError, predictionsRow) => {
      if (predictionsError) {
        console.error("Erro ao contar palpites:", predictionsError.message);
        return res.status(500).json({ success: false, message: "Erro ao contar palpites." });
      }

      summary.predictions = Number(predictionsRow?.total || 0);

      db.get("SELECT COUNT(*) AS total FROM match_results", [], (resultsError, resultsRow) => {
        if (resultsError) {
          console.error("Erro ao contar resultados:", resultsError.message);
          return res.status(500).json({ success: false, message: "Erro ao contar resultados." });
        }

        summary.results = Number(resultsRow?.total || 0);
        summary.averagePerUser = summary.users > 0
          ? Number((summary.predictions / summary.users).toFixed(1))
          : 0;

        return res.json({
          success: true,
          summary
        });
      });
    });
  });
});








async function deletePredictionFromNeonIfAvailable(data) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return {
        success: false,
        deleted: 0,
        message: "Neon não configurado."
      };
    }

    const phone = String(data.phone || "").replace(/\D/g, "");
    const rawMatchId = String(data.matchId || "").trim();

    if (!phone || !rawMatchId) {
      return {
        success: false,
        deleted: 0,
        message: "Dados insuficientes para resetar palpite."
      };
    }

    const userResult = await pool.query(
      `
        SELECT id
        FROM users
        WHERE phone = $1
        LIMIT 1
      `,
      [phone]
    );

    if (!userResult.rows.length) {
      return {
        success: false,
        deleted: 0,
        message: "Usuário não encontrado no Neon."
      };
    }

    const matchIds = Array.from(new Set([
      rawMatchId,
      rawMatchId === "A-01" ? "m01" : null,
      rawMatchId === "m01" ? "A-01" : null
    ].filter(Boolean)));

    const result = await pool.query(
      `
        DELETE FROM predictions
        WHERE user_id = $1
          AND match_id = ANY($2::text[])
      `,
      [userResult.rows[0].id, matchIds]
    );

    console.log("Palpite resetado no Neon:", phone, matchIds.join(","), result.rowCount);

    return {
      success: true,
      deleted: result.rowCount || 0
    };
  } catch (error) {
    console.error("Erro ao resetar palpite no Neon:", error.message);

    return {
      success: false,
      deleted: 0,
      message: error.message
    };
  }
}


async function savePredictionOnlyInNeonIfAvailable(data) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return {
        success: false,
        message: "Neon não configurado."
      };
    }

    const phone = String(data.phone || "").replace(/\D/g, "");
    const rawMatchId = String(data.matchId || "").trim();
    const homeScore = Number(data.homeScore);
    const awayScore = Number(data.awayScore);

    if (!phone) {
      return {
        success: false,
        message: "Usuário inválido para salvar palpite."
      };
    }

    if (!rawMatchId) {
      return {
        success: false,
        message: "Jogo inválido para salvar palpite."
      };
    }

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      return {
        success: false,
        message: "Placar inválido."
      };
    }

    if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      return {
        success: false,
        message: "O placar deve ter no máximo 2 dígitos por seleção."
      };
    }

    const userResult = await pool.query(
      `
        SELECT id
        FROM users
        WHERE phone = $1
        LIMIT 1
      `,
      [phone]
    );

    if (!userResult.rows.length) {
      return {
        success: false,
        message: "Usuário não encontrado no Neon."
      };
    }

    const possibleMatchIds = Array.from(new Set([
      rawMatchId,
      rawMatchId === "A-01" ? "m01" : null,
      rawMatchId === "m01" ? "A-01" : null
    ].filter(Boolean)));

    let match = null;
    let finalMatchId = rawMatchId;

    for (const candidateId of possibleMatchIds) {
      const matchResult = await pool.query(
        `
          SELECT id, home_team, away_team
          FROM matches
          WHERE id = $1
          LIMIT 1
        `,
        [candidateId]
      );

      if (matchResult.rows.length) {
        match = matchResult.rows[0];
        finalMatchId = match.id;
        break;
      }
    }

    if (!match) {
      return {
        success: false,
        message: "Jogo não encontrado no Neon."
      };
    }

    await pool.query(
      `
        INSERT INTO predictions (
          user_id,
          match_id,
          home_team,
          away_team,
          home_score,
          away_score,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, match_id)
        DO UPDATE SET
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        userResult.rows[0].id,
        finalMatchId,
        match.home_team,
        match.away_team,
        homeScore,
        awayScore
      ]
    );

    console.log("Palpite salvo diretamente no Neon:", phone, finalMatchId, homeScore, awayScore);

    return {
      success: true,
      matchId: finalMatchId,
      homeScore,
      awayScore
    };
  } catch (error) {
    console.error("Erro ao salvar palpite direto no Neon:", error.message);

    return {
      success: false,
      message: error.message || "Erro ao salvar palpite no Neon."
    };
  }
}


async function savePredictionToNeonIfAvailable(data) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      console.warn("Neon não configurado. Palpite salvo apenas no banco principal.");
      return;
    }

    const phone = String(data.phone || "").replace(/\D/g, "");
    const matchId = String(data.matchId || "").trim();
    const homeScore = Number(data.homeScore);
    const awayScore = Number(data.awayScore);

    if (!phone || !matchId || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      console.warn("Dados insuficientes para salvar palpite no Neon.");
      return;
    }

    const userResult = await pool.query(
      `
        SELECT id
        FROM users
        WHERE phone = $1
        LIMIT 1
      `,
      [phone]
    );

    if (!userResult.rows.length) {
      console.warn("Usuário não encontrado no Neon para salvar palpite:", phone);
      return;
    }

    let finalMatchId = matchId;

    const matchResult = await pool.query(
      `
        SELECT id, home_team, away_team
        FROM matches
        WHERE id = $1
        LIMIT 1
      `,
      [finalMatchId]
    );

    let match = matchResult.rows[0];

    if (!match && finalMatchId === "A-01") {
      const fallback = await pool.query(
        `
          SELECT id, home_team, away_team
          FROM matches
          WHERE id = 'm01'
          LIMIT 1
        `
      );

      if (fallback.rows.length) {
        finalMatchId = "m01";
        match = fallback.rows[0];
      }
    }

    if (!match && finalMatchId === "m01") {
      const fallback = await pool.query(
        `
          SELECT id, home_team, away_team
          FROM matches
          WHERE id = 'A-01'
          LIMIT 1
        `
      );

      if (fallback.rows.length) {
        finalMatchId = "A-01";
        match = fallback.rows[0];
      }
    }

    if (!match) {
      console.warn("Jogo não encontrado no Neon para salvar palpite:", matchId);
      return;
    }

    await pool.query(
      `
        INSERT INTO predictions (
          user_id,
          match_id,
          home_team,
          away_team,
          home_score,
          away_score,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, match_id)
        DO UPDATE SET
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        userResult.rows[0].id,
        finalMatchId,
        match.home_team,
        match.away_team,
        homeScore,
        awayScore
      ]
    );

    console.log("Palpite salvo/atualizado no Neon:", phone, finalMatchId, homeScore, awayScore);
  } catch (error) {
    console.error("Erro ao salvar palpite no Neon:", error.message);
  }
}


async function findUserInNeonByPhone(phone) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return null;
    }

    const normalizedPhone = typeof normalizePhone === "function"
      ? normalizePhone(phone)
      : String(phone || "").replace(/\D/g, "");

    const result = await pool.query(
      `
        SELECT
          id,
          username,
          first_name,
          last_name,
          phone,
          activation_code,
          activation_origin,
          password_hash
        FROM users
        WHERE phone = $1
        LIMIT 1
      `,
      [normalizedPhone]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error("Erro ao buscar usuário no Neon:", error.message);
    return null;
  }
}


async function saveUserToNeonIfAvailable(userData) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      console.warn("Neon não configurado. Cadastro salvo apenas no banco principal.");
      return;
    }

    const fullName = String(userData.username || userData.fullName || "").trim();
    const firstName = String(userData.firstName || "").trim();
    const lastName = String(userData.lastName || "").trim();
    const phone = String(userData.phone || "").replace(/\D/g, "");
    const activationCode = userData.activationCode || null;
    const activationOrigin = userData.activationOrigin || "Público Instagram";
    const passwordHash = userData.passwordHash;

    if (!phone || !passwordHash) {
      console.warn("Dados insuficientes para salvar usuário no Neon.");
      return;
    }

    await pool.query(
      `
        INSERT INTO users (
          username,
          first_name,
          last_name,
          phone,
          activation_code,
          activation_origin,
          password_hash,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (phone)
        DO UPDATE SET
          username = EXCLUDED.username,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          activation_code = EXCLUDED.activation_code,
          activation_origin = EXCLUDED.activation_origin,
          password_hash = EXCLUDED.password_hash
      `,
      [
        fullName,
        firstName,
        lastName,
        phone,
        activationCode,
        activationOrigin,
        passwordHash
      ]
    );

    console.log("Usuário salvo/atualizado no Neon:", phone);
  } catch (error) {
    console.error("Erro ao salvar usuário no Neon:", error.message);
  }
}


app.get("/admin/neon-status", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");

    if (!neon.hasNeonUrl()) {
      return res.status(500).json({
        success: false,
        connected: false,
        message: "DATABASE_URL não encontrada no ambiente."
      });
    }

    const result = await neon.testNeonConnection();

    return res.json({
      success: true,
      connected: true,
      database: result.database,
      now: result.now
    });
  } catch (error) {
    console.error("Erro ao testar Neon:", error.message);

    return res.status(500).json({
      success: false,
      connected: false,
      message: error.message
    });
  }
});



app.get("/admin/neon-users", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon não configurado."
      });
    }

    const result = await pool.query(`
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_code,
        u.activation_origin,
        u.created_at,
        COUNT(p.id) AS predictions_count
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return res.json({
      success: true,
      users: result.rows.map((user) => ({
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        activationCode: user.activation_code,
        activationOrigin: user.activation_origin,
        createdAt: user.created_at,
        predictionsCount: Number(user.predictions_count || 0)
      }))
    });
  } catch (error) {
    console.error("Erro ao listar usuários do Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao listar usuários do Neon.",
      error: error.message
    });
  }
});



app.get("/admin/neon-summary", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon não configurado."
      });
    }

    const usersResult = await pool.query("SELECT COUNT(*) AS total FROM users");
    const predictionsResult = await pool.query("SELECT COUNT(*) AS total FROM predictions");
    const resultsResult = await pool.query("SELECT COUNT(*) AS total FROM match_results");

    const users = Number(usersResult.rows[0]?.total || 0);
    const predictions = Number(predictionsResult.rows[0]?.total || 0);
    const results = Number(resultsResult.rows[0]?.total || 0);

    return res.json({
      success: true,
      summary: {
        users,
        predictions,
        results,
        averagePerUser: users > 0 ? Number((predictions / users).toFixed(1)) : 0
      }
    });
  } catch (error) {
    console.error("Erro ao carregar resumo do Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar resumo do Neon.",
      error: error.message
    });
  }
});



app.get("/admin/neon-ranking", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon não configurado."
      });
    }

    const result = await pool.query(`
      SELECT
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_origin,
        p.match_id,
        p.home_team,
        p.away_team,
        p.home_score AS pred_home_score,
        p.away_score AS pred_away_score,
        r.home_score AS result_home_score,
        r.away_score AS result_away_score
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      LEFT JOIN match_results r ON r.match_id = p.match_id
      ORDER BY u.created_at ASC, p.updated_at DESC
    `);

    const usersMap = new Map();

    result.rows.forEach((row) => {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          id: row.user_id,
          username: row.username,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          activationOrigin: row.activation_origin || "Público Instagram",
          predictionsCount: 0,
          scoredPredictions: 0,
          points: 0
        });
      }

      const user = usersMap.get(row.user_id);

      if (!row.match_id) return;

      user.predictionsCount += 1;

      if (
        row.result_home_score !== null &&
        row.result_away_score !== null &&
        row.result_home_score !== undefined &&
        row.result_away_score !== undefined
      ) {
        user.scoredPredictions += 1;
      }

      if (typeof calculatePredictionPoints === "function") {
        user.points += calculatePredictionPoints(row);
      }
    });

    const ranking = Array.from(usersMap.values())
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.predictionsCount !== a.predictionsCount) return b.predictionsCount - a.predictionsCount;
        return String(a.username || "").localeCompare(String(b.username || ""), "pt-BR");
      })
      .map((user, index) => ({
        position: index + 1,
        ...user
      }));

    return res.json({
      success: true,
      ranking
    });
  } catch (error) {
    console.error("Erro ao carregar ranking Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar ranking Neon.",
      error: error.message
    });
  }
});



app.get("/leaderboard-neon", async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon não configurado."
      });
    }

    const result = await pool.query(`
      SELECT
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_origin,
        p.match_id,
        p.home_team,
        p.away_team,
        p.home_score AS pred_home_score,
        p.away_score AS pred_away_score,
        r.home_score AS result_home_score,
        r.away_score AS result_away_score
      FROM users u
      LEFT JOIN predictions p ON p.user_id = u.id
      LEFT JOIN match_results r ON r.match_id = p.match_id
      ORDER BY u.created_at ASC, p.updated_at DESC
    `);

    const usersMap = new Map();

    result.rows.forEach((row) => {
      if (!usersMap.has(row.user_id)) {
        usersMap.set(row.user_id, {
          id: row.user_id,
          name: row.username || [row.first_name, row.last_name].filter(Boolean).join(" "),
          username: row.username,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          activationOrigin: row.activation_origin || "Público Instagram",
          predictionsCount: 0,
          scoredPredictions: 0,
          points: 0
        });
      }

      const user = usersMap.get(row.user_id);

      if (!row.match_id) return;

      user.predictionsCount += 1;

      if (
        row.result_home_score !== null &&
        row.result_away_score !== null &&
        row.result_home_score !== undefined &&
        row.result_away_score !== undefined
      ) {
        user.scoredPredictions += 1;
      }

      if (typeof calculatePredictionPoints === "function") {
        user.points += calculatePredictionPoints(row);
      }
    });

    const ranking = Array.from(usersMap.values())
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.predictionsCount !== a.predictionsCount) return b.predictionsCount - a.predictionsCount;
        return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
      })
      .map((user, index) => ({
        position: index + 1,
        ...user
      }));

    return res.json({
      success: true,
      leaderboard: ranking,
      ranking
    });
  } catch (error) {
    console.error("Erro ao carregar classificação pública Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar classificação pública Neon.",
      error: error.message
    });
  }
});


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});