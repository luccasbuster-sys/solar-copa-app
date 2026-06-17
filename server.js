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
// SOLAR_BACKEND_BLOQUEIO_15MIN_2R_START
/*
  Bloqueio antifraude no backend:
  - Aposta, alteração de palpite e reset ficam disponíveis somente até 15 minutos antes do jogo.
  - Horários informados no fuso de Brasília (-03:00).
  - Comparação feita no servidor com new Date(), não no relógio do navegador.
  - Admin não é bloqueado aqui para não travar atualização real de resultados.
*/

const SOLAR_2R_LOCK_MINUTES_BEFORE = 15;

const SOLAR_2R_SCHEDULE_BRASILIA = {
  "18-06-2026-a-tchequia-x-africa-do-sul": "2026-06-18T13:00:00-03:00",
  "18-06-2026-b-suica-x-bosnia-e-herzegovina": "2026-06-18T16:00:00-03:00",
  "18-06-2026-b-canada-x-catar": "2026-06-18T19:00:00-03:00",
  "18-06-2026-a-mexico-x-coreia-do-sul": "2026-06-18T22:00:00-03:00",

  "19-06-2026-d-estados-unidos-x-australia": "2026-06-19T16:00:00-03:00",
  "19-06-2026-c-escocia-x-marrocos": "2026-06-19T19:00:00-03:00",
  "19-06-2026-c-brasil-x-haiti": "2026-06-19T21:30:00-03:00",

  "20-06-2026-d-turquia-x-paraguai": "2026-06-20T00:00:00-03:00",
  "20-06-2026-f-holanda-x-suecia": "2026-06-20T14:00:00-03:00",
  "20-06-2026-e-alemanha-x-costa-do-marfim": "2026-06-20T17:00:00-03:00",
  "20-06-2026-e-equador-x-curacao": "2026-06-20T21:00:00-03:00",

  "21-06-2026-f-tunisia-x-japao": "2026-06-21T01:00:00-03:00",
  "21-06-2026-h-espanha-x-arabia-saudita": "2026-06-21T13:00:00-03:00",
  "21-06-2026-g-belgica-x-ira": "2026-06-21T16:00:00-03:00",
  "21-06-2026-h-uruguai-x-cabo-verde": "2026-06-21T19:00:00-03:00",
  "21-06-2026-g-nova-zelandia-x-egito": "2026-06-21T22:00:00-03:00",

  "22-06-2026-j-argentina-x-austria": "2026-06-22T14:00:00-03:00",
  "22-06-2026-i-franca-x-iraque": "2026-06-22T18:00:00-03:00",
  "22-06-2026-i-noruega-x-senegal": "2026-06-22T21:00:00-03:00",

  "23-06-2026-j-jordania-x-argelia": "2026-06-23T00:00:00-03:00",
  "23-06-2026-k-portugal-x-uzbequistao": "2026-06-23T14:00:00-03:00",
  "23-06-2026-l-inglaterra-x-gana": "2026-06-23T17:00:00-03:00",
  "23-06-2026-l-panama-x-croacia": "2026-06-23T20:00:00-03:00",
  "23-06-2026-k-colombia-x-rd-congo": "2026-06-23T23:00:00-03:00"
};

function solarNormalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function solarFormatBrasilia(date) {
  try {
    return date.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (error) {
    return date.toISOString();
  }
}

function solarGetValue(source, names) {
  if (!source || typeof source !== "object") return "";

  for (const name of names) {
    if (source[name] !== undefined && source[name] !== null && String(source[name]).trim() !== "") {
      return String(source[name]).trim();
    }
  }

  return "";
}

function solarGetSecondRoundGameIdFromRequest(req) {
  const sources = [req.body || {}, req.params || {}, req.query || {}];

  const idNames = [
    "matchId",
    "match_id",
    "gameId",
    "game_id",
    "jogoId",
    "jogo_id",
    "dataGameCard",
    "data_game_card",
    "id"
  ];

  for (const source of sources) {
    const directId = solarGetValue(source, idNames);

    if (directId) {
      const normalizedId = solarNormalizeText(directId);

      if (SOLAR_2R_SCHEDULE_BRASILIA[directId]) return directId;
      if (SOLAR_2R_SCHEDULE_BRASILIA[normalizedId]) return normalizedId;
    }
  }

  const body = req.body || {};

  const data = solarGetValue(body, ["data", "date", "dia"]);
  const grupo = solarGetValue(body, ["grupo", "group"]);
  const mandante = solarGetValue(body, ["mandante", "home", "homeTeam", "timeCasa"]);
  const visitante = solarGetValue(body, ["visitante", "away", "awayTeam", "timeFora"]);

  if (data && grupo && mandante && visitante) {
    const normalizedDate = String(data)
      .trim()
      .replace(/\//g, "-")
      .replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3-$2-$1");

    const generatedId = [
      normalizedDate,
      solarNormalizeText(grupo),
      solarNormalizeText(mandante),
      "x",
      solarNormalizeText(visitante)
    ].join("-");

    if (SOLAR_2R_SCHEDULE_BRASILIA[generatedId]) {
      return generatedId;
    }
  }

  return "";
}

function solarIsSecondRoundPredictionMutation(req) {
  const method = String(req.method || "").toUpperCase();

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return false;
  }

  const url = String(req.originalUrl || req.url || "").toLowerCase();

  if (url.includes("/admin")) {
    return false;
  }

  const isPredictionUrl =
    /palpite|palpites|prediction|predictions|aposta|apostas|guess|guesses|bolao|bolão|score|placar/.test(url);

  const gameId = solarGetSecondRoundGameIdFromRequest(req);

  if (!gameId) {
    return false;
  }

  if (isPredictionUrl) {
    return true;
  }

  const bodyText = JSON.stringify(req.body || {}).toLowerCase();

  return /palpite|prediction|aposta|guess|score|placar|homeScore|awayScore|mandante|visitante|reset|clear|delete/.test(bodyText);
}

function solarGetSecondRoundLockInfo(gameId) {
  const startIso = SOLAR_2R_SCHEDULE_BRASILIA[gameId];

  if (!startIso) {
    return null;
  }

  const startAt = new Date(startIso);
  const lockedAt = new Date(startAt.getTime() - SOLAR_2R_LOCK_MINUTES_BEFORE * 60 * 1000);
  const now = new Date();

  return {
    gameId,
    startAt,
    lockedAt,
    now,
    locked: now.getTime() >= lockedAt.getTime()
  };
}

function solarSecondRoundBackendLockMiddleware(req, res, next) {
  try {
    if (!solarIsSecondRoundPredictionMutation(req)) {
      return next();
    }

    const gameId = solarGetSecondRoundGameIdFromRequest(req);
    const lockInfo = solarGetSecondRoundLockInfo(gameId);

    if (!lockInfo || !lockInfo.locked) {
      return next();
    }

    return res.status(423).json({
      success: false,
      ok: false,
      code: "SOLAR_BET_LOCKED_15_MINUTES_BEFORE_MATCH",
      message: "Aposta bloqueada: palpites, alterações e reset ficam disponíveis somente até 15 minutos antes do jogo no horário de Brasília.",
      gameId: lockInfo.gameId,
      lockedAtBrasilia: solarFormatBrasilia(lockInfo.lockedAt),
      startAtBrasilia: solarFormatBrasilia(lockInfo.startAt),
      serverNowBrasilia: solarFormatBrasilia(lockInfo.now)
    });
  } catch (error) {
    console.error("Erro no bloqueio backend 15min 2ª rodada:", error);
    return res.status(500).json({
      success: false,
      ok: false,
      code: "SOLAR_BACKEND_LOCK_ERROR",
      message: "Erro interno ao validar prazo do palpite."
    });
  }
}

app.use(solarSecondRoundBackendLockMiddleware);
// SOLAR_BACKEND_BLOQUEIO_15MIN_2R_END


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
      message: "VocÃƒÂª precisa estar logado."
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
  OUTLET2026: "Outlet 2026",
  CD2026: "Centro de DistribuiÃƒÂ§ÃƒÂ£o",
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



function normalizeTextForMatchCompare(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getOfficialKickoffOverride(match) {
  if (!match) return null;

  const id = String(match.id || match.match_id || "").trim().toLowerCase();
  const home = normalizeTextForMatchCompare(match.home_team || match.homeTeam || "");
  const away = normalizeTextForMatchCompare(match.away_team || match.awayTeam || "");

  if (
    id === "m03" ||
    id === "b-01" ||
    (home.includes("canad") && away.includes("bosnia"))
  ) {
    return "2026-06-12T19:00:00Z";
  }

  if (
    id === "m04" ||
    id === "d-01" ||
    ((home.includes("estados unidos") || home.includes("united states")) && (away.includes("paraguai") || away.includes("paraguay")))
  ) {
    return "2026-06-13T01:00:00Z";
  }

  return null;
}

function parseMatchDateTime(match) {
  if (!match) return null;

  const officialKickoff = getOfficialKickoffOverride(match);

  if (officialKickoff) {
    const date = new Date(officialKickoff);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const rawKickoff = String(match.kickoff_at || match.kickoff || match.kickoffAt || "").trim();
  const rawDate = String(match.match_date || match.date || match.matchDate || "").trim();

  if (!rawKickoff && !rawDate) {
    return null;
  }

  const candidates = [];
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(rawKickoff);

  if (rawKickoff.includes("T")) {
    if (!hasTimezone) {
      candidates.push(rawKickoff + "-03:00");
    }

    candidates.push(rawKickoff);
  }

  const timeMatch = rawKickoff.match(/^(\d{2}:\d{2})(?::(\d{2}))?$/);

  if (rawDate && timeMatch) {
    const timeText = timeMatch[2] ? rawKickoff : rawKickoff + ":00";
    candidates.push(rawDate + "T" + timeText + "-03:00");
    candidates.push(rawDate + "T" + timeText);
  }

  if (rawDate && rawKickoff) {
    candidates.push(rawDate + " " + rawKickoff);
  }

  if (rawKickoff) {
    candidates.push(rawKickoff);
  }

  for (const candidate of Array.from(new Set(candidates))) {
    const date = new Date(candidate);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}


function formatMatchKickoffForClient(match) {
  const kickoffDate = parseMatchDateTime(match);

  if (!kickoffDate) {
    return {
      kickoff_at: match && match.kickoff_at ? match.kickoff_at : null,
      kickoffAt: match && (match.kickoffAt || match.kickoff_at) ? (match.kickoffAt || match.kickoff_at) : null,
      kickoffTimeBR: match && (match.kickoffTimeBR || match.kickoff_time_br) ? (match.kickoffTimeBR || match.kickoff_time_br) : null,
      timezone: "America/Sao_Paulo"
    };
  }

  return {
    kickoff_at: kickoffDate.toISOString(),
    kickoffAt: kickoffDate.toISOString(),
    kickoffTimeBR: kickoffDate.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }),
    timezone: "America/Sao_Paulo"
  };
}

function normalizeMatchForClient(match) {
  if (!match) return match;

  return {
    ...match,
    ...formatMatchKickoffForClient(match)
  };
}

function normalizeMatchesForClient(matches) {
  return Array.isArray(matches) ? matches.map(normalizeMatchForClient) : [];
}

function isPredictionLockedForMatch(match) {
  const kickoffDate = parseMatchDateTime(match);

  if (!kickoffDate) {
    return false;
  }

  return Date.now() >= kickoffDate.getTime();
}

function getPredictionLockedMessage() {
  return "O prazo para palpitar neste jogo foi encerrado porque a partida ja comecou. Nao e possivel salvar, alterar ou resetar este palpite.";
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
    TRANSPORTE2026: "Transporte 2026",
    ADM2026: "Administrativo 2026",
  };

  return extraCodes[code] || null;
}


function getActivationCodeOrigin(activationCode) {
  const code = String(activationCode || "").trim().toUpperCase();

  if (!code) {
    return "PÃƒÂºblico Instagram";
  }

  const extraActivationCodes = {
    OUTLET2026: "Outlet 2026",
    TRANSPORTE2026: "Transporte 2026",
    ADM2026: "Administrativo 2026",
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


function getAllActivationCodes() {
  const allCodes = {};

  try {
    if (typeof ACTIVATION_CODES !== "undefined" && ACTIVATION_CODES) {
      Object.assign(allCodes, ACTIVATION_CODES);
    }
  } catch (error) {}

  try {
    if (typeof activationCodes !== "undefined" && activationCodes) {
      Object.assign(allCodes, activationCodes);
    }
  } catch (error) {}

  Object.assign(allCodes, {
    OUTLET2026: "Outlet 2026",
    TRANSPORTE2026: "Transporte 2026",
    ADM2026: "Administrativo 2026"
  });

  return allCodes;
}

function getActivationCodeOriginFinal(activationCode) {
  const code = String(activationCode || "").trim().toUpperCase();

  if (!code) {
    return "PÃƒÂºblico Instagram";
  }

  const allCodes = getAllActivationCodes();

  return allCodes[code] || null;
}

function isActivationCodeAllowedFinal(activationCode) {
  const code = String(activationCode || "").trim().toUpperCase();

  if (!code) {
    return true;
  }

  return Boolean(getActivationCodeOriginFinal(code));
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



/* ===== CADASTRO PÃƒÅ¡BLICO COM CÃƒâ€œDIGO OPCIONAL ===== */





/* ===== REGISTER MANTENDO TODOS OS CODIGOS ATIVOS ===== */
app.post("/register", (req, res) => {
  const fullName = String(req.body.fullName || req.body.name || req.body.username || "").trim();

  const phone = typeof normalizePhone === "function"
    ? normalizePhone(req.body.phone)
    : String(req.body.phone || "").replace(/\D/g, "");

  const password = String(req.body.password || "").trim();
  const activationCode = String(req.body.activationCode || "").trim().toUpperCase();
  const activationOrigin = activationCode === "OUTLET2026"
    ? "Outlet 2026"
    : getActivationCodeOriginFinal(activationCode);

  if (!fullName || !phone || !password) {
    return res.status(400).json({
      success: false,
      message: "Informe nome e sobrenome, telefone e senha."
    });
  }

  if (
    activationCode &&
    activationCode !== "OUTLET2026" &&
    !isActivationCodeAllowedFinal(activationCode)
  ) {
    return res.status(400).json({
      success: false,
      message: "CÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o invÃƒÂ¡lido."
    });
  }

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
          message: "Esse telefone jÃƒÂ¡ estÃƒÂ¡ cadastrado."
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

            try {
              if (typeof saveUserToNeonIfAvailable === "function") {
                saveUserToNeonIfAvailable({
                  username: fullName,
                  firstName,
                  lastName,
                  phone,
                  activationCode: activationCode || null,
                  activationOrigin,
                  passwordHash
                });
              }
            } catch (error) {
              console.error("Erro ao salvar usuÃƒÂ¡rio no Neon:", error.message);
            }

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
/* ===== FIM REGISTER MANTENDO TODOS OS CODIGOS ATIVOS ===== */


app.post("/register", (req, res) => {
  const fullName = String(req.body.fullName || req.body.name || req.body.username || "").trim();
  const phone = typeof normalizePhone === "function"
    ? normalizePhone(req.body.phone)
    : String(req.body.phone || "").replace(/\D/g, "");

  const password = String(req.body.password || "").trim();
  const activationCode = String(req.body.activationCode || "").trim().toUpperCase();

  
  // CÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o liberado para campanha Outlet
  if (activationCode === "OUTLET2026") {
    try {
      if (typeof ACTIVATION_CODES !== "undefined") {
        ACTIVATION_CODES.OUTLET2026 = "Outlet 2026";
      }

      if (typeof activationCodes !== "undefined") {
        activationCodes.OUTLET2026 = "Outlet 2026";
      }
    } catch (error) {
      console.warn("NÃƒÂ£o foi possÃƒÂ­vel registrar OUTLET2026:", error.message);
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
      message: "CÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o invÃƒÂ¡lido."
    });
  }

  const activationOrigin = activationCode ? codeMap[activationCode] : "PÃƒÂºblico Instagram";

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
          message: "Esse telefone jÃƒÂ¡ estÃƒÂ¡ cadastrado."
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
        message: "Informe nome e sobrenome, telefone, senha e cÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o."
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
        message: "Informe um telefone vÃƒÂ¡lido com DDD."
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
        message: "CÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o invÃƒÂ¡lido."
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
              message: "Esse telefone jÃƒÂ¡ estÃƒÂ¡ cadastrado."
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
          message: "Telefone ou senha invÃƒÂ¡lidos."
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
        console.error("Erro ao buscar usuÃƒÂ¡rio no banco principal:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar usuÃƒÂ¡rio."
        });
      }

      if (userRow) {
        return finishLoginWithUser(userRow, "sqlite");
      }

      const neonUser = await findUserInNeonByPhone(phone);

      if (!neonUser) {
        return res.status(401).json({
          success: false,
          message: "Telefone ou senha invÃƒÂ¡lidos."
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
      message: "UsuÃƒÂ¡rio nÃƒÂ£o estÃƒÂ¡ logado."
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
        matches: normalizeMatchesForClient(rows)
      });
    }
  );
});

app.get("/matches/day/:date", requireLogin, (req, res) => {
  const date = String(req.params.date || "").trim();

  if (!isValidDate(date)) {
    return res.status(400).json({
      success: false,
      message: "Data invÃƒÂ¡lida. Use o formato YYYY-MM-DD."
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
        matches: normalizeMatchesForClient(rows)
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
        matches: normalizeMatchesForClient(rows)
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


async function savePredictionToNeonFinal(data) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return {
        success: false,
        message: "Neon nÃƒÂ£o configurado."
      };
    }

    const phone = String(data.phone || "").replace(/\D/g, "");
    const rawMatchId = String(data.matchId || "").trim();
    const homeScore = Number(data.homeScore);
    const awayScore = Number(data.awayScore);

    if (!phone) {
      return {
        success: false,
        message: "UsuÃƒÂ¡rio invÃƒÂ¡lido para salvar placar."
      };
    }

    if (!rawMatchId) {
      return {
        success: false,
        message: "Jogo invÃƒÂ¡lido."
      };
    }

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      return {
        success: false,
        message: "Placar invÃƒÂ¡lido."
      };
    }

    if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      return {
        success: false,
        message: "O placar deve ter no mÃƒÂ¡ximo 2 dÃƒÂ­gitos por seleÃƒÂ§ÃƒÂ£o."
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
        message: "UsuÃƒÂ¡rio nÃƒÂ£o encontrado no banco."
      };
    }

    const candidates = Array.from(new Set([
      rawMatchId,
      rawMatchId.toUpperCase(),
      rawMatchId.toLowerCase(),
      rawMatchId === "A-01" ? "m01" : null,
      rawMatchId === "m01" ? "A-01" : null,
      rawMatchId === "M01" ? "A-01" : null
    ].filter(Boolean)));

    let match = null;

    for (const candidate of candidates) {
      const matchResult = await pool.query(
        `
          SELECT id, home_team, away_team, match_date, kickoff_at
          FROM matches
          WHERE id = $1
          LIMIT 1
        `,
        [candidate]
      );

      if (matchResult.rows.length) {
        match = matchResult.rows[0];
        break;
      }
    }

    if (!match) {
      return {
        success: false,
        message: "Jogo nÃƒÂ£o encontrado no banco."
      };
    }

    if (isPredictionLockedForMatch(match)) {
      return {
        success: false,
        locked: true,
        message: getPredictionLockedMessage()
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
        match.id,
        match.home_team,
        match.away_team,
        homeScore,
        awayScore
      ]
    );

    console.log("Palpite salvo no Neon:", phone, match.id, homeScore, awayScore);

    return {
      success: true,
      matchId: match.id,
      homeScore,
      awayScore
    };
  } catch (error) {
    console.error("Erro ao salvar placar no Neon:", error.message);

    return {
      success: false,
      message: error.message || "Erro ao salvar placar."
    };
  }
}



app.post("/predictions", requireLogin, async (req, res) => {
  const matchId = String(req.body.matchId || req.body.match_id || "").trim();

  const homeScore = typeof normalizeScoreValue === "function"
    ? normalizeScoreValue(req.body.homeScore)
    : Number(req.body.homeScore);

  const awayScore = typeof normalizeScoreValue === "function"
    ? normalizeScoreValue(req.body.awayScore)
    : Number(req.body.awayScore);

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "Jogo invÃƒÂ¡lido."
    });
  }

  if (homeScore === null || awayScore === null || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return res.status(400).json({
      success: false,
      message: "Informe um placar vÃƒÂ¡lido."
    });
  }

  if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
    return res.status(400).json({
      success: false,
      message: "O placar deve ter no mÃƒÂ¡ximo 2 dÃƒÂ­gitos por seleÃƒÂ§ÃƒÂ£o."
    });
  }

  const neonResult = await savePredictionToNeonFinal({
    phone: req.session.user && req.session.user.phone,
    matchId,
    homeScore,
    awayScore
  });

  if (!neonResult.success) {
    return res.status(neonResult.locked ? 403 : 400).json({
      success: false,
      locked: Boolean(neonResult.locked),
      message: neonResult.message || "Erro ao salvar placar."
    });
  }

  return res.json({
    success: true,
    message: "Palpite salvo com sucesso.",
    prediction: {
      matchId: neonResult.matchId,
      homeScore: neonResult.homeScore,
      awayScore: neonResult.awayScore
    }
  });
});



app.delete("/predictions/:matchId", requireLogin, async (req, res) => {
  const userId = req.session.user && req.session.user.id;
  const phone = req.session.user && req.session.user.phone;
  const matchId = String(req.params.matchId || "").trim();

  if (!matchId) {
    return res.status(400).json({
      success: false,
      message: "Jogo invÃƒÂ¡lido."
    });
  }

  const matchIds = Array.from(new Set([
    matchId,
    matchId === "A-01" ? "m01" : null,
    matchId === "m01" ? "A-01" : null
  ].filter(Boolean)));

  let matchToReset = null;

  try {
    matchToReset = await new Promise((resolve, reject) => {
      db.get(
        `
          SELECT id, match_date, kickoff_at
          FROM matches
          WHERE id IN (${matchIds.map(() => "?").join(",")})
          LIMIT 1
        `,
        matchIds,
        (error, row) => {
          if (error) {
            return reject(error);
          }

          return resolve(row || null);
        }
      );
    });
  } catch (error) {
    console.error("Erro ao validar horario do jogo antes de resetar palpite:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao validar horario do jogo."
    });
  }

  if (matchToReset && isPredictionLockedForMatch(matchToReset)) {
    return res.status(403).json({
      success: false,
      locked: true,
      message: getPredictionLockedMessage()
    });
  }

  const neonResult = await deletePredictionFromNeonIfAvailable({
    phone,
    matchId
  });

  if (neonResult.locked) {
    return res.status(403).json({
      success: false,
      locked: true,
      message: neonResult.message || getPredictionLockedMessage()
    });
  }

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
        console.error("Erro ao buscar classificaÃƒÂ§ÃƒÂ£o:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar classificaÃƒÂ§ÃƒÂ£o."
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
      message: "Acesso administrativo nÃƒÂ£o autorizado."
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
    Regra oficial do BolÃƒÂ£o Solar:

    +1 ponto por palpite realizado
    +3 pontos se acertar o vencedor ou empate
    +2 pontos de bÃƒÂ´nus se acertar o placar exato

    MÃƒÂ¡ximo por jogo: 6 pontos.
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

  const predictedResult = Math.sign(predictedHome - predictedAway);
  const realResult = Math.sign(realHome - realAway);

  const exactScore = predictedHome === realHome && predictedAway === realAway;
  const correctWinnerOrDraw = predictedResult === realResult;

  if (correctWinnerOrDraw) {
    points += 3;
  }

  if (exactScore) {
    points += 2;
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
      message: "UsuÃƒÂ¡rio ou senha de administrador invÃƒÂ¡lidos."
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
      message: "Administrador nÃƒÂ£o estÃƒÂ¡ logado."
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
      message: "ID de usuÃƒÂ¡rio invÃƒÂ¡lido."
    });
  }

  db.get(
    "SELECT id, username, first_name, last_name, phone FROM users WHERE id = ?",
    [userId],
    (findError, user) => {
      if (findError) {
        console.error("Erro ao buscar usuÃƒÂ¡rio para exclusÃƒÂ£o:", findError.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao buscar usuÃƒÂ¡rio."
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "UsuÃƒÂ¡rio nÃƒÂ£o encontrado."
        });
      }

      db.serialize(() => {
        db.run(
          "DELETE FROM predictions WHERE user_id = ?",
          [userId],
          function (predictionsError) {
            if (predictionsError) {
              console.error("Erro ao excluir palpites do usuÃƒÂ¡rio:", predictionsError.message);

              return res.status(500).json({
                success: false,
                message: "Erro ao excluir palpites do usuÃƒÂ¡rio."
              });
            }

            const deletedPredictions = this.changes || 0;

            db.run(
              "DELETE FROM users WHERE id = ?",
              [userId],
              function (userError) {
                if (userError) {
                  console.error("Erro ao excluir usuÃƒÂ¡rio:", userError.message);

                  return res.status(500).json({
                    success: false,
                    message: "Erro ao excluir usuÃƒÂ¡rio."
                  });
                }

                return res.json({
                  success: true,
                  message: "UsuÃƒÂ¡rio excluÃƒÂ­do com sucesso.",
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
        console.error("Erro ao exportar usuÃƒÂ¡rios:", error.message);

        return res.status(500).json({
          success: false,
          message: "Erro ao exportar usuÃƒÂ¡rios."
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
            { label: "Data da exportaÃƒÂ§ÃƒÂ£o", value: new Date().toLocaleString("pt-BR") },
            { label: "Total de usuÃƒÂ¡rios", value: totalUsers },
            { label: "Total de palpites", value: totalPredictions },
            { label: "Total de jogos cadastrados", value: totalMatches },
            { label: "Jogos com resultado lanÃƒÂ§ado", value: totalResults },
            { label: "MÃƒÂ©dia de palpites por usuÃƒÂ¡rio", value: totalUsers > 0 ? Number((totalPredictions / totalUsers).toFixed(2)) : 0 },
            { label: "Regra: placar exato", value: "2 pontos de bÃƒÂ´nus" },
            { label: "Regra: vencedor ou empate correto", value: "3 pontos" },
            { label: "Regra: gols corretos por time", value: "pontuaÃƒÂ§ÃƒÂ£o mÃƒÂ¡xima 6 pontos" }
          ]);

          styleSheet(summarySheet);

          const rankingSheet = workbook.addWorksheet("ClassificaÃƒÂ§ÃƒÂ£o");

          rankingSheet.columns = [
            { header: "PosiÃƒÂ§ÃƒÂ£o", key: "position", width: 10 },
            { header: "UsuÃƒÂ¡rio", key: "username", width: 32 },
            { header: "Telefone", key: "phone", width: 18 },
            { header: "Origem", key: "activationOrigin", width: 34 },
            { header: "CÃƒÂ³digo", key: "activationCode", width: 18 },
            { header: "PontuaÃƒÂ§ÃƒÂ£o", key: "points", width: 14 },
            { header: "Palpites salvos", key: "predictionsCount", width: 18 },
            { header: "Palpites pontuados", key: "scoredPredictions", width: 22 },
            { header: "ÃƒÅ¡ltimo palpite", key: "lastPredictionAt", width: 24 }
          ];

          users.forEach((user) => rankingSheet.addRow(user));
          styleSheet(rankingSheet);
          rankingSheet.autoFilter = { from: "A1", to: "I1" };

          const usersSheet = workbook.addWorksheet("UsuÃƒÂ¡rios Cadastrados");

          usersSheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "UsuÃƒÂ¡rio", key: "username", width: 32 },
            { header: "Telefone", key: "phone", width: 18 },
            { header: "CÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o", key: "activationCode", width: 22 },
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
            { header: "UsuÃƒÂ¡rio", key: "username", width: 32 },
            { header: "Telefone", key: "phone", width: 18 },
            { header: "Origem", key: "activationOrigin", width: 34 },
            { header: "Jogo", key: "matchId", width: 14 },
            { header: "Grupo", key: "groupName", width: 12 },
            { header: "Mandante", key: "homeTeam", width: 24 },
            { header: "Visitante", key: "awayTeam", width: 24 },
            { header: "Data", key: "matchDate", width: 16 },
            { header: "HorÃƒÂ¡rio", key: "kickoffAt", width: 24 },
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
            { header: "HorÃƒÂ¡rio", key: "kickoff_at", width: 24 },
            { header: "EstÃƒÂ¡dio", key: "venue", width: 42 },
            { header: "Fase", key: "stage", width: 20 }
          ];

          matchesRows.forEach((match) => matchesSheet.addRow(match));
          styleSheet(matchesSheet);
          matchesSheet.autoFilter = { from: "A1", to: "H1" };

          const resultsSheet = workbook.addWorksheet("Resultados LanÃƒÂ§ados");

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
            { header: "UsuÃƒÂ¡rios", key: "usersCount", width: 14 },
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

app.get("/admin/matches/day/:date", requireAdmin, async (req, res) => {
  try {
    const date = String(req.params.date || "").trim();

    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "Data invÃ¡lida. Use o formato YYYY-MM-DD."
      });
    }

    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃ£o configurado."
      });
    }

    const result = await pool.query(
      `
        SELECT
          m.id,
          m.group_name,
          m.home_team,
          m.away_team,
          TO_CHAR(m.match_date::date, 'YYYY-MM-DD') AS match_date,
          m.kickoff_at,
          m.venue,
          r.home_score AS result_home_score,
          r.away_score AS result_away_score,
          r.updated_at AS result_updated_at
        FROM matches m
        LEFT JOIN match_results r ON r.match_id = m.id
        WHERE m.match_date::date = $1::date
        ORDER BY m.kickoff_at ASC, m.id ASC
      `,
      [date]
    );

    const seen = new Set();

    const matches = result.rows.filter((match) => {
      const key = [
        String(match.home_team || "").trim().toLowerCase(),
        String(match.away_team || "").trim().toLowerCase(),
        String(match.match_date || "").trim(),
        String(match.kickoff_at || "").trim()
      ].join("|");

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    return res.json({
      success: true,
      date,
      matches
    });
  } catch (error) {
    console.error("Erro ao buscar jogos do dia admin no Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao buscar jogos do dia no Neon.",
      error: error.message
    });
  }
});
app.get("/admin/matches/group-stage", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃ£o configurado."
      });
    }

    const result = await pool.query(
      `
        SELECT
          m.id,
          m.group_name,
          m.home_team,
          m.away_team,
          TO_CHAR(m.match_date::date, 'YYYY-MM-DD') AS match_date,
          m.kickoff_at,
          m.venue,
          r.home_score AS result_home_score,
          r.away_score AS result_away_score,
          r.updated_at AS result_updated_at
        FROM matches m
        LEFT JOIN match_results r ON r.match_id = m.id
        WHERE m.stage = 'Fase de grupos'
        ORDER BY m.match_date::date ASC, m.kickoff_at ASC, m.id ASC
      `
    );

    const seen = new Set();

    const matches = result.rows.filter((match) => {
      const key = [
        String(match.home_team || "").trim().toLowerCase(),
        String(match.away_team || "").trim().toLowerCase(),
        String(match.match_date || "").trim(),
        String(match.kickoff_at || "").trim()
      ].join("|");

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    return res.json({
      success: true,
      matches
    });
  } catch (error) {
    console.error("Erro ao buscar fase de grupos admin no Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao buscar fase de grupos no Neon.",
      error: error.message
    });
  }
});
app.post("/admin/results", requireAdmin, async (req, res) => {
  try {
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
        message: "Informe placares vÃ¡lidos."
      });
    }

    if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      return res.status(400).json({
        success: false,
        message: "O placar deve estar entre 0 e 99."
      });
    }

    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃ£o configurado."
      });
    }

    const matchResult = await pool.query(
      "SELECT id FROM matches WHERE id = $1",
      [matchId]
    );

    if (!matchResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Jogo nÃ£o encontrado no Neon."
      });
    }

    await pool.query(
      `
        INSERT INTO match_results (
          match_id,
          home_score,
          away_score,
          updated_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (match_id)
        DO UPDATE SET
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          updated_at = NOW()
      `,
      [matchId, homeScore, awayScore]
    );

    return res.json({
      success: true,
      message: "Resultado atualizado com sucesso.",
      result: {
        matchId,
        homeScore,
        awayScore
      }
    });
  } catch (error) {
    console.error("Erro ao salvar resultado no Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao salvar resultado no Neon.",
      error: error.message
    });
  }
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
      console.error("Erro ao contar usuÃƒÂ¡rios:", usersError.message);
      return res.status(500).json({ success: false, message: "Erro ao contar usuÃƒÂ¡rios." });
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
        message: "Neon nÃƒÂ£o configurado."
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
        message: "UsuÃƒÂ¡rio nÃƒÂ£o encontrado no Neon."
      };
    }

    const matchIds = Array.from(new Set([
      rawMatchId,
      rawMatchId === "A-01" ? "m01" : null,
      rawMatchId === "m01" ? "A-01" : null
    ].filter(Boolean)));

    const matchResult = await pool.query(
      `
        SELECT id, match_date, kickoff_at
        FROM matches
        WHERE id = ANY($1::text[])
        LIMIT 1
      `,
      [matchIds]
    );

    const matchToReset = matchResult.rows[0] || null;

    if (matchToReset && isPredictionLockedForMatch(matchToReset)) {
      return {
        success: false,
        deleted: 0,
        locked: true,
        message: getPredictionLockedMessage()
      };
    }

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
        message: "Neon nÃƒÂ£o configurado."
      };
    }

    const phone = String(data.phone || "").replace(/\D/g, "");
    const rawMatchId = String(data.matchId || "").trim();
    const homeScore = Number(data.homeScore);
    const awayScore = Number(data.awayScore);

    if (!phone) {
      return {
        success: false,
        message: "UsuÃƒÂ¡rio invÃƒÂ¡lido para salvar palpite."
      };
    }

    if (!rawMatchId) {
      return {
        success: false,
        message: "Jogo invÃƒÂ¡lido para salvar palpite."
      };
    }

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      return {
        success: false,
        message: "Placar invÃƒÂ¡lido."
      };
    }

    if (homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      return {
        success: false,
        message: "O placar deve ter no mÃƒÂ¡ximo 2 dÃƒÂ­gitos por seleÃƒÂ§ÃƒÂ£o."
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
        message: "UsuÃƒÂ¡rio nÃƒÂ£o encontrado no Neon."
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
          SELECT id, home_team, away_team, match_date, kickoff_at
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
        message: "Jogo nÃƒÂ£o encontrado no Neon."
      };
    }

    if (isPredictionLockedForMatch(match)) {
      return {
        success: false,
        locked: true,
        message: getPredictionLockedMessage()
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
      console.warn("Neon nÃƒÂ£o configurado. Palpite salvo apenas no banco principal.");
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
      console.warn("UsuÃƒÂ¡rio nÃƒÂ£o encontrado no Neon para salvar palpite:", phone);
      return;
    }

    let finalMatchId = matchId;

    const matchResult = await pool.query(
      `
        SELECT id, home_team, away_team, match_date, kickoff_at
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
          SELECT id, home_team, away_team, match_date, kickoff_at
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
          SELECT id, home_team, away_team, match_date, kickoff_at
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
      console.warn("Jogo nÃƒÂ£o encontrado no Neon para salvar palpite:", matchId);
      return;
    }

    if (isPredictionLockedForMatch(match)) {
      console.warn("Palpite bloqueado no Neon porque o jogo ja comecou:", phone, finalMatchId);
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
    console.error("Erro ao buscar usuÃƒÂ¡rio no Neon:", error.message);
    return null;
  }
}


async function saveUserToNeonIfAvailable(userData) {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      console.warn("Neon nÃƒÂ£o configurado. Cadastro salvo apenas no banco principal.");
      return;
    }

    const fullName = String(userData.username || userData.fullName || "").trim();
    const firstName = String(userData.firstName || "").trim();
    const lastName = String(userData.lastName || "").trim();
    const phone = String(userData.phone || "").replace(/\D/g, "");
    const activationCode = userData.activationCode || null;
    const activationOrigin = userData.activationOrigin || "PÃƒÂºblico Instagram";
    const passwordHash = userData.passwordHash;

    if (!phone || !passwordHash) {
      console.warn("Dados insuficientes para salvar usuÃƒÂ¡rio no Neon.");
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

    console.log("UsuÃƒÂ¡rio salvo/atualizado no Neon:", phone);
  } catch (error) {
    console.error("Erro ao salvar usuÃƒÂ¡rio no Neon:", error.message);
  }
}


app.get("/admin/neon-status", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");

    if (!neon.hasNeonUrl()) {
      return res.status(500).json({
        success: false,
        connected: false,
        message: "DATABASE_URL nÃƒÂ£o encontrada no ambiente."
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
        message: "Neon nÃƒÂ£o configurado."
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
    console.error("Erro ao listar usuÃƒÂ¡rios do Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao listar usuÃƒÂ¡rios do Neon.",
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
        message: "Neon nÃƒÂ£o configurado."
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
        message: "Neon nÃƒÂ£o configurado."
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
          activationOrigin: row.activation_origin || "PÃƒÂºblico Instagram",
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
        message: "Neon nÃƒÂ£o configurado."
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
          activationOrigin: row.activation_origin || "PÃƒÂºblico Instagram",
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
    console.error("Erro ao carregar classificaÃƒÂ§ÃƒÂ£o pÃƒÂºblica Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar classificaÃƒÂ§ÃƒÂ£o pÃƒÂºblica Neon.",
      error: error.message
    });
  }
});









async function exportNeonDashboardSpreadsheet(req, res) {
  try {
    const ExcelJS = require("exceljs");
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃƒÂ£o configurado."
      });
    }

    const usersResult = await pool.query(`
      SELECT
        id,
        username,
        first_name,
        last_name,
        phone,
        activation_code,
        activation_origin,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);

    const predictionsResult = await pool.query(`
      SELECT
        p.id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_code,
        u.activation_origin,
        p.match_id,
        p.home_team,
        p.away_team,
        p.home_score,
        p.away_score,
        p.created_at,
        p.updated_at
      FROM predictions p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.updated_at DESC, p.created_at DESC
    `);

    const rankingResult = await pool.query(`
      SELECT
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_code,
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

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "Solar Copa 2026";
    workbook.created = new Date();

    const colors = {
      black: "FF050505",
      white: "FFFFFFFF",
      cyan: "FF21D3CA",
      lime: "FFD6FF00",
      red: "FFFF2D24",
      cream: "FFFFFBEC"
    };

    function formatDate(value) {
      if (!value) return "";

      try {
        return new Date(value).toLocaleString("pt-BR");
      } catch (error) {
        return "";
      }
    }

    function styleSheet(sheet, color = colors.black) {
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      sheet.getRow(1).height = 30;
      sheet.getRow(1).font = {
        bold: true,
        color: { argb: colors.white },
        size: 11
      };

      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color }
      };

      sheet.getRow(1).alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true
      };

      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE0E0E0" } },
            left: { style: "thin", color: { argb: "FFE0E0E0" } },
            bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
            right: { style: "thin", color: { argb: "FFE0E0E0" } }
          };

          cell.alignment = {
            vertical: "middle",
            wrapText: true
          };

          if (rowNumber > 1) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: rowNumber % 2 === 0 ? colors.cream : colors.white }
            };
          }
        });
      });
    }

    function autoWidth(sheet) {
      sheet.columns.forEach((column) => {
        let maxLength = 12;

        column.eachCell({ includeEmpty: true }, (cell) => {
          const value = cell.value ? String(cell.value) : "";
          maxLength = Math.max(maxLength, value.length + 2);
        });

        column.width = Math.min(Math.max(maxLength, 14), 46);
      });
    }

    const users = usersResult.rows;
    const predictions = predictionsResult.rows;

    const rankingMap = new Map();

    rankingResult.rows.forEach((row) => {
      if (!rankingMap.has(row.user_id)) {
        rankingMap.set(row.user_id, {
          id: row.user_id,
          nome: row.username || [row.first_name, row.last_name].filter(Boolean).join(" "),
          telefone: row.phone,
          codigo: row.activation_code || "",
          origem: row.activation_origin || "PÃƒÂºblico Instagram",
          pontos: 0,
          palpites: 0,
          palpitesPontuados: 0
        });
      }

      const user = rankingMap.get(row.user_id);

      if (!row.match_id) return;

      user.palpites += 1;

      if (
        row.result_home_score !== null &&
        row.result_away_score !== null &&
        row.result_home_score !== undefined &&
        row.result_away_score !== undefined
      ) {
        user.palpitesPontuados += 1;
      }

      if (typeof calculatePredictionPoints === "function") {
        user.pontos += calculatePredictionPoints(row);
      }
    });

    const ranking = Array.from(rankingMap.values())
      .sort((a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;
        if (b.palpites !== a.palpites) return b.palpites - a.palpites;
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
      })
      .map((user, index) => ({
        posicao: index + 1,
        ...user
      }));

    const origemMap = new Map();

    users.forEach((user) => {
      const origem = user.activation_origin || "PÃƒÂºblico Instagram";

      if (!origemMap.has(origem)) {
        origemMap.set(origem, {
          origem,
          usuarios: 0,
          palpites: 0
        });
      }

      origemMap.get(origem).usuarios += 1;
    });

    predictions.forEach((prediction) => {
      const origem = prediction.activation_origin || "PÃƒÂºblico Instagram";

      if (!origemMap.has(origem)) {
        origemMap.set(origem, {
          origem,
          usuarios: 0,
          palpites: 0
        });
      }

      origemMap.get(origem).palpites += 1;
    });

    const resumoSheet = workbook.addWorksheet("Resumo");

    resumoSheet.columns = [
      { header: "Indicador", key: "indicador" },
      { header: "Valor", key: "valor" }
    ];

    resumoSheet.addRows([
      { indicador: "FONTE DOS DADOS", valor: "NEON POSTGRESQL" },
      { indicador: "UsuÃƒÂ¡rios cadastrados", valor: users.length },
      { indicador: "Palpites salvos", valor: predictions.length },
      {
        indicador: "MÃƒÂ©dia de palpites por usuÃƒÂ¡rio",
        valor: users.length > 0 ? Number((predictions.length / users.length).toFixed(2)) : 0
      },
      { indicador: "Exportado em", valor: new Date().toLocaleString("pt-BR") },
      { indicador: "Regra: placar exato", valor: "2 pontos de bÃƒÂ´nus" },
      { indicador: "Regra: vencedor ou empate correto", valor: "3 pontos" },
      { indicador: "Regra: gols corretos por time", valor: "pontuaÃƒÂ§ÃƒÂ£o mÃƒÂ¡xima 6 pontos" }
    ]);

    styleSheet(resumoSheet, colors.black);
    autoWidth(resumoSheet);

    const origemSheet = workbook.addWorksheet("Por origem");

    origemSheet.columns = [
      { header: "Origem / CÃƒÂ³digo", key: "origem" },
      { header: "UsuÃƒÂ¡rios", key: "usuarios" },
      { header: "Palpites", key: "palpites" }
    ];

    Array.from(origemMap.values())
      .sort((a, b) => b.usuarios - a.usuarios)
      .forEach((item) => origemSheet.addRow(item));

    styleSheet(origemSheet, colors.cyan);
    autoWidth(origemSheet);
    origemSheet.autoFilter = { from: "A1", to: "C1" };

    const usersSheet = workbook.addWorksheet("UsuÃƒÂ¡rios");

    usersSheet.columns = [
      { header: "ID", key: "id" },
      { header: "Nome completo", key: "nome" },
      { header: "Primeiro nome", key: "firstName" },
      { header: "Sobrenome", key: "lastName" },
      { header: "Telefone", key: "phone" },
      { header: "CÃƒÂ³digo de ativaÃƒÂ§ÃƒÂ£o", key: "activationCode" },
      { header: "Origem", key: "activationOrigin" },
      { header: "Data de cadastro", key: "createdAt" }
    ];

    users.forEach((user) => {
      usersSheet.addRow({
        id: user.id,
        nome: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        activationCode: user.activation_code || "",
        activationOrigin: user.activation_origin || "PÃƒÂºblico Instagram",
        createdAt: formatDate(user.created_at)
      });
    });

    styleSheet(usersSheet, colors.lime);
    autoWidth(usersSheet);
    usersSheet.autoFilter = { from: "A1", to: "H1" };

    const predictionsSheet = workbook.addWorksheet("Palpites");

    predictionsSheet.columns = [
      { header: "ID", key: "id" },
      { header: "UsuÃƒÂ¡rio", key: "user" },
      { header: "Telefone", key: "phone" },
      { header: "CÃƒÂ³digo", key: "code" },
      { header: "Origem", key: "origin" },
      { header: "Jogo", key: "matchId" },
      { header: "Mandante", key: "homeTeam" },
      { header: "Visitante", key: "awayTeam" },
      { header: "Placar mandante", key: "homeScore" },
      { header: "Placar visitante", key: "awayScore" },
      { header: "Criado em", key: "createdAt" },
      { header: "Atualizado em", key: "updatedAt" }
    ];

    predictions.forEach((prediction) => {
      predictionsSheet.addRow({
        id: prediction.id,
        user: prediction.username,
        phone: prediction.phone,
        code: prediction.activation_code || "",
        origin: prediction.activation_origin || "PÃƒÂºblico Instagram",
        matchId: prediction.match_id,
        homeTeam: prediction.home_team,
        awayTeam: prediction.away_team,
        homeScore: prediction.home_score,
        awayScore: prediction.away_score,
        createdAt: formatDate(prediction.created_at),
        updatedAt: formatDate(prediction.updated_at)
      });
    });

    styleSheet(predictionsSheet, colors.red);
    autoWidth(predictionsSheet);
    predictionsSheet.autoFilter = { from: "A1", to: "L1" };

    const rankingSheet = workbook.addWorksheet("Ranking");

    rankingSheet.columns = [
      { header: "PosiÃƒÂ§ÃƒÂ£o", key: "posicao" },
      { header: "Nome", key: "nome" },
      { header: "Telefone", key: "telefone" },
      { header: "CÃƒÂ³digo", key: "codigo" },
      { header: "Origem", key: "origem" },
      { header: "Pontos", key: "pontos" },
      { header: "Palpites", key: "palpites" },
      { header: "Palpites pontuados", key: "palpitesPontuados" }
    ];

    ranking.forEach((user) => rankingSheet.addRow(user));

    styleSheet(rankingSheet, colors.black);
    autoWidth(rankingSheet);
    rankingSheet.autoFilter = { from: "A1", to: "H1" };

    const fileName = "relatorio-solar-copa-neon.xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Erro ao exportar planilha Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao exportar planilha Neon.",
      error: error.message
    });
  }
}

app.get("/admin/export-neon", requireAdmin, exportNeonDashboardSpreadsheet);
app.get("/admin/export", requireAdmin, exportNeonDashboardSpreadsheet);
app.get("/admin/export-dashboard", requireAdmin, exportNeonDashboardSpreadsheet);



app.delete("/admin/neon-users/:id", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃƒÂ£o configurado."
      });
    }

    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "UsuÃƒÂ¡rio invÃƒÂ¡lido."
      });
    }

    const userResult = await pool.query(
      "SELECT id, username, phone FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "UsuÃƒÂ¡rio nÃƒÂ£o encontrado."
      });
    }

    await pool.query("DELETE FROM predictions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    return res.json({
      success: true,
      message: "UsuÃƒÂ¡rio excluÃƒÂ­do com sucesso.",
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error("Erro ao excluir usuÃƒÂ¡rio do Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao excluir usuÃƒÂ¡rio.",
      error: error.message
    });
  }
});



app.post("/admin/neon-users/:id/delete", requireAdmin, async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃƒÂ£o configurado."
      });
    }

    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        message: "UsuÃƒÂ¡rio invÃƒÂ¡lido."
      });
    }

    const userResult = await pool.query(
      "SELECT id, username, phone FROM users WHERE id = $1 LIMIT 1",
      [userId]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "UsuÃƒÂ¡rio nÃƒÂ£o encontrado."
      });
    }

    await pool.query("DELETE FROM predictions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    return res.json({
      success: true,
      message: "UsuÃƒÂ¡rio excluÃƒÂ­do com sucesso.",
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error("Erro ao excluir usuÃƒÂ¡rio do Neon:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao excluir usuÃƒÂ¡rio.",
      error: error.message
    });
  }
});









app.get("/matches/day", async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        sucesso: false,
        message: "Neon nÃƒÂ£o configurado."
      });
    }

    const date = String(req.query.date || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        sucesso: false,
        message: "Data invÃƒÂ¡lida. Use ?date=YYYY-MM-DD"
      });
    }

    const result = await pool.query(
      `
        SELECT
          id,
          group_name,
          home_team,
          away_team,
          TO_CHAR(match_date::date, 'YYYY-MM-DD') AS match_date_br,
          TO_CHAR(kickoff_at::timestamp, 'HH24:MI') AS kickoff_time_br,
          kickoff_at
        FROM matches
        WHERE match_date::date = $1::date
        ORDER BY kickoff_at ASC, id ASC
      `,
      [date]
    );

    const seen = new Set();

    const matches = result.rows
      .filter((match) => {
        const id = String(match.id || "").trim();

        // Abertura jÃƒÂ¡ fica fixa no app. NÃƒÂ£o duplica em Jogos do Dia.
        if (id === "A-01" || id === "m01" || id === "M01") {
          return false;
        }

        const key = [
          String(match.home_team || "").toLowerCase(),
          String(match.away_team || "").toLowerCase(),
          String(match.match_date_br || ""),
          String(match.kickoff_time_br || "")
        ].join("|");

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      })
      .map((match) => {
        const kickoff = formatMatchKickoffForClient({
          id: match.id,
          match_id: match.id,
          home_team: match.home_team,
          away_team: match.away_team,
          match_date: match.match_date_br,
          kickoff_at: match.kickoff_at,
          kickoff_time_br: match.kickoff_time_br
        });

        return {
          id: match.id,
          groupName: match.group_name,
          homeTeam: match.home_team,
          awayTeam: match.away_team,
          matchDate: match.match_date_br,
          kickoffTimeBR: kickoff.kickoffTimeBR,
          kickoffAt: kickoff.kickoffAt,
          kickoff_at: kickoff.kickoff_at,
          timezone: kickoff.timezone
        };
      });

    return res.json({
      success: true,
      sucesso: true,
      date,
      data: date,
      timezone: "America/Sao_Paulo",
      matches,
      partidas: matches
    });
  } catch (error) {
    console.error("Erro ao carregar jogos do dia:", error.message);

    return res.status(500).json({
      success: false,
      sucesso: false,
      message: "Erro ao carregar jogos do dia.",
      error: error.message
    });
  }
});



app.get("/matches/first-round", async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃƒÂ£o configurado."
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        group_name,
        home_team,
        away_team,
        TO_CHAR(match_date::date, 'YYYY-MM-DD') AS match_date,
        TO_CHAR(kickoff_at::timestamp, 'HH24:MI') AS kickoff_time_br,
        kickoff_at
      FROM matches
      ORDER BY group_name ASC, kickoff_at ASC, id ASC
    `);

    const seen = new Set();
    const uniqueMatches = [];

    for (const match of result.rows) {
      const key = [
        String(match.group_name || "").toUpperCase(),
        String(match.home_team || "").toLowerCase(),
        String(match.away_team || "").toLowerCase(),
        String(match.match_date || ""),
        String(match.kickoff_time_br || "")
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniqueMatches.push(match);
    }

    const byGroup = new Map();

    for (const match of uniqueMatches) {
      const group = String(match.group_name || "SEM GRUPO").toUpperCase();

      if (!byGroup.has(group)) {
        byGroup.set(group, []);
      }

      byGroup.get(group).push(match);
    }

    const firstRound = [];

    for (const [group, matches] of byGroup.entries()) {
      const ordered = matches.sort((a, b) => {
        const dateA = new Date(a.kickoff_at).getTime();
        const dateB = new Date(b.kickoff_at).getTime();

        if (dateA !== dateB) return dateA - dateB;

        return String(a.id).localeCompare(String(b.id));
      });

      ordered.slice(0, 2).forEach((match) => {
        firstRound.push(match);
      });
    }

    firstRound.sort((a, b) => {
      const dateA = new Date(a.kickoff_at).getTime();
      const dateB = new Date(b.kickoff_at).getTime();

      if (dateA !== dateB) return dateA - dateB;

      return String(a.id).localeCompare(String(b.id));
    });

    const matches = firstRound.map((match) => {
      const kickoffDate = parseMatchDateTime(match);

      const kickoffTimeBR = kickoffDate
        ? kickoffDate.toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          })
        : match.kickoff_time_br;

      const kickoffAt = kickoffDate
        ? kickoffDate.toISOString()
        : match.kickoff_at;

      return {
        id: match.id,
        groupName: match.group_name,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        matchDate: match.match_date,
        kickoffTimeBR,
        kickoffAt,
        timezone: "America/Sao_Paulo"
      };
    });

    return res.json({
      success: true,
      timezone: "America/Sao_Paulo",
      total: matches.length,
      matches
    });
  } catch (error) {
    console.error("Erro ao carregar primeira rodada:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar primeira rodada.",
      error: error.message
    });
  }
});



app.get("/api/first-round-matches", async (req, res) => {
  try {
    const neon = require("./neon-db");
    const pool = neon.getNeonPool();

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Neon nÃƒÂ£o configurado."
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        group_name,
        home_team,
        away_team,
        TO_CHAR(match_date::date, 'YYYY-MM-DD') AS match_date,
        TO_CHAR(kickoff_at::timestamp, 'HH24:MI') AS kickoff_time_br,
        kickoff_at
      FROM matches
      ORDER BY group_name ASC, kickoff_at ASC, id ASC
    `);

    const seen = new Set();
    const uniqueMatches = [];

    for (const match of result.rows) {
      const key = [
        String(match.group_name || "").toUpperCase(),
        String(match.home_team || "").toLowerCase(),
        String(match.away_team || "").toLowerCase(),
        String(match.match_date || ""),
        String(match.kickoff_time_br || "")
      ].join("|");

      if (seen.has(key)) continue;

      seen.add(key);
      uniqueMatches.push(match);
    }

    const byGroup = new Map();

    for (const match of uniqueMatches) {
      const group = String(match.group_name || "SEM GRUPO").toUpperCase();

      if (!byGroup.has(group)) {
        byGroup.set(group, []);
      }

      byGroup.get(group).push(match);
    }

    const firstRound = [];

    for (const [group, matches] of byGroup.entries()) {
      const ordered = matches.sort((a, b) => {
        const dateA = new Date(a.kickoff_at).getTime();
        const dateB = new Date(b.kickoff_at).getTime();

        if (dateA !== dateB) return dateA - dateB;

        return String(a.id).localeCompare(String(b.id));
      });

      ordered.slice(0, 2).forEach((match) => {
        firstRound.push(match);
      });
    }

    firstRound.sort((a, b) => {
      const dateA = new Date(a.kickoff_at).getTime();
      const dateB = new Date(b.kickoff_at).getTime();

      if (dateA !== dateB) return dateA - dateB;

      return String(a.id).localeCompare(String(b.id));
    });

    const matches = firstRound.map((match) => {
      const kickoffDate = parseMatchDateTime(match);

      const kickoffTimeBR = kickoffDate
        ? kickoffDate.toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          })
        : match.kickoff_time_br;

      const kickoffAt = kickoffDate
        ? kickoffDate.toISOString()
        : match.kickoff_at;

      return {
        id: match.id,
        groupName: match.group_name,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        matchDate: match.match_date,
        kickoffTimeBR,
        kickoffAt,
        timezone: "America/Sao_Paulo"
      };
    });

    return res.json({
      success: true,
      source: "neon",
      round: "first-round",
      timezone: "America/Sao_Paulo",
      total: matches.length,
      matches
    });
  } catch (error) {
    console.error("Erro ao carregar primeira rodada:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar primeira rodada.",
      error: error.message
    });
  }
});


app.get("/api/second-round-matches", async (req, res) => {
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
        id,
        group_name,
        home_team,
        away_team,
        TO_CHAR(match_date::date, 'YYYY-MM-DD') AS match_date,
        TO_CHAR(kickoff_at::timestamp, 'HH24:MI') AS kickoff_time_br,
        kickoff_at
      FROM matches
      ORDER BY group_name ASC, kickoff_at ASC, id ASC
    `);

    const seen = new Set();
    const uniqueMatches = [];

    for (const match of result.rows) {
      const key = [
        String(match.group_name || "").toUpperCase(),
        String(match.home_team || "").toLowerCase(),
        String(match.away_team || "").toLowerCase(),
        String(match.match_date || ""),
        String(match.kickoff_time_br || "")
      ].join("|");

      if (seen.has(key)) continue;

      seen.add(key);
      uniqueMatches.push(match);
    }

    const byGroup = new Map();

    for (const match of uniqueMatches) {
      const group = String(match.group_name || "SEM GRUPO").toUpperCase();

      if (!byGroup.has(group)) {
        byGroup.set(group, []);
      }

      byGroup.get(group).push(match);
    }

    const secondRound = [];

    for (const [group, matches] of byGroup.entries()) {
      const ordered = matches.sort((a, b) => {
        const dateA = new Date(a.kickoff_at).getTime();
        const dateB = new Date(b.kickoff_at).getTime();

        if (dateA !== dateB) return dateA - dateB;

        return String(a.id).localeCompare(String(b.id));
      });

      ordered.slice(2, 4).forEach((match) => {
        secondRound.push(match);
      });
    }

    secondRound.sort((a, b) => {
      const dateA = new Date(a.kickoff_at).getTime();
      const dateB = new Date(b.kickoff_at).getTime();

      if (dateA !== dateB) return dateA - dateB;

      return String(a.id).localeCompare(String(b.id));
    });

    const matches = secondRound.map((match) => {
      const kickoffDate = parseMatchDateTime(match);

      const kickoffTimeBR = kickoffDate
        ? kickoffDate.toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          })
        : match.kickoff_time_br;

      const kickoffAt = kickoffDate
        ? kickoffDate.toISOString()
        : match.kickoff_at;

      return {
        id: match.id,
        groupName: match.group_name,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        matchDate: match.match_date,
        kickoffTimeBR,
        kickoffAt,
        timezone: "America/Sao_Paulo"
      };
    });

    return res.json({
      success: true,
      source: "neon",
      round: "second-round",
      timezone: "America/Sao_Paulo",
      total: matches.length,
      matches
    });
  } catch (error) {
    console.error("Erro ao carregar segunda rodada:", error.message);

    return res.status(500).json({
      success: false,
      message: "Erro ao carregar segunda rodada.",
      error: error.message
    });
  }
});

// SOLAR_ADMIN_FRONT_ROUTE_START
(function instalarRotasFrontAdminSolar() {
  const path = require("path");

  const adminFrontHandler = function (req, res) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  };

  app.get("/admin", adminFrontHandler);
  app.get("/administrador", adminFrontHandler);
  app.get("/painel-admin", adminFrontHandler);

  console.log("Rotas front do administrador carregadas: /admin, /administrador, /painel-admin");
})();
// SOLAR_ADMIN_FRONT_ROUTE_END

// SOLAR_2R_PONTUACAO_GLOBAL_BACKEND_START
(function instalarPontuacaoGlobalSegundaRodada() {
  const fs = require("fs");
  const path = require("path");
  const { Pool } = require("pg");

  function loadEnvIfNeeded() {
    const hasUrl =
      process.env.DATABASE_URL ||
      process.env.NEON_DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL;

    if (hasUrl) return;

    const envPath = path.join(__dirname, ".env");

    if (!fs.existsSync(envPath)) return;

    fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
      const clean = line.trim();
      if (!clean || clean.startsWith("#")) return;

      const index = clean.indexOf("=");
      if (index === -1) return;

      const key = clean.slice(0, index).trim();
      let value = clean.slice(index + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) process.env[key] = value;
    });
  }

  loadEnvIfNeeded();

  const DATABASE_URL =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";

  let pool = null;
  let tablesReady = false;

  const LOCK_MINUTES = 15;

  const GAMES = {
    "18-06-2026-a-tchequia-x-africa-do-sul": ["18/06/2026", "A", "Tchéquia", "África do Sul", "2026-06-18T13:00:00-03:00"],
    "18-06-2026-b-suica-x-bosnia-e-herzegovina": ["18/06/2026", "B", "Suíça", "Bósnia e Herzegovina", "2026-06-18T16:00:00-03:00"],
    "18-06-2026-b-canada-x-catar": ["18/06/2026", "B", "Canadá", "Catar", "2026-06-18T19:00:00-03:00"],
    "18-06-2026-a-mexico-x-coreia-do-sul": ["18/06/2026", "A", "México", "Coreia do Sul", "2026-06-18T22:00:00-03:00"],

    "19-06-2026-d-estados-unidos-x-australia": ["19/06/2026", "D", "Estados Unidos", "Austrália", "2026-06-19T16:00:00-03:00"],
    "19-06-2026-c-escocia-x-marrocos": ["19/06/2026", "C", "Escócia", "Marrocos", "2026-06-19T19:00:00-03:00"],
    "19-06-2026-c-brasil-x-haiti": ["19/06/2026", "C", "Brasil", "Haiti", "2026-06-19T21:30:00-03:00"],
    "20-06-2026-d-turquia-x-paraguai": ["20/06/2026", "D", "Turquia", "Paraguai", "2026-06-20T00:00:00-03:00"],

    "20-06-2026-f-holanda-x-suecia": ["20/06/2026", "F", "Holanda", "Suécia", "2026-06-20T14:00:00-03:00"],
    "20-06-2026-e-alemanha-x-costa-do-marfim": ["20/06/2026", "E", "Alemanha", "Costa do Marfim", "2026-06-20T17:00:00-03:00"],
    "20-06-2026-e-equador-x-curacao": ["20/06/2026", "E", "Equador", "Curaçao", "2026-06-20T21:00:00-03:00"],
    "21-06-2026-f-tunisia-x-japao": ["21/06/2026", "F", "Tunísia", "Japão", "2026-06-21T01:00:00-03:00"],

    "21-06-2026-h-espanha-x-arabia-saudita": ["21/06/2026", "H", "Espanha", "Arábia Saudita", "2026-06-21T13:00:00-03:00"],
    "21-06-2026-g-belgica-x-ira": ["21/06/2026", "G", "Bélgica", "Irã", "2026-06-21T16:00:00-03:00"],
    "21-06-2026-h-uruguai-x-cabo-verde": ["21/06/2026", "H", "Uruguai", "Cabo Verde", "2026-06-21T19:00:00-03:00"],
    "21-06-2026-g-nova-zelandia-x-egito": ["21/06/2026", "G", "Nova Zelândia", "Egito", "2026-06-21T22:00:00-03:00"],

    "22-06-2026-j-argentina-x-austria": ["22/06/2026", "J", "Argentina", "Áustria", "2026-06-22T14:00:00-03:00"],
    "22-06-2026-i-franca-x-iraque": ["22/06/2026", "I", "França", "Iraque", "2026-06-22T18:00:00-03:00"],
    "22-06-2026-i-noruega-x-senegal": ["22/06/2026", "I", "Noruega", "Senegal", "2026-06-22T21:00:00-03:00"],
    "23-06-2026-j-jordania-x-argelia": ["23/06/2026", "J", "Jordânia", "Argélia", "2026-06-23T00:00:00-03:00"],

    "23-06-2026-k-portugal-x-uzbequistao": ["23/06/2026", "K", "Portugal", "Uzbequistão", "2026-06-23T14:00:00-03:00"],
    "23-06-2026-l-inglaterra-x-gana": ["23/06/2026", "L", "Inglaterra", "Gana", "2026-06-23T17:00:00-03:00"],
    "23-06-2026-l-panama-x-croacia": ["23/06/2026", "L", "Panamá", "Croácia", "2026-06-23T20:00:00-03:00"],
    "23-06-2026-k-colombia-x-rd-congo": ["23/06/2026", "K", "Colômbia", "RD Congo", "2026-06-23T23:00:00-03:00"]
  };

  const GAME_IDS = Object.keys(GAMES);

  function getPool() {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL / NEON_DATABASE_URL / POSTGRES_URL não configurada.");
    }

    if (!pool) {
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false },
        max: 5
      });
    }

    return pool;
  }

  async function ensureTables() {
    if (tablesReady) return;

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_segunda_rodada_palpites (
        id BIGSERIAL PRIMARY KEY,
        user_key TEXT NOT NULL,
        game_id TEXT NOT NULL,
        round_code TEXT NOT NULL DEFAULT '2',
        game_date TEXT,
        group_code TEXT,
        home_team TEXT,
        away_team TEXT,
        home_score INTEGER,
        away_score INTEGER,
        source TEXT DEFAULT 'app',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_key, game_id)
      );
    `);

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_segunda_rodada_pontos (
        user_key TEXT PRIMARY KEY,
        palpites_salvos INTEGER NOT NULL DEFAULT 0,
        pontos_segunda_rodada INTEGER NOT NULL DEFAULT 0,
        rodada_completa BOOLEAN NOT NULL DEFAULT FALSE,
        total_jogos INTEGER NOT NULL DEFAULT 24,
        primeiro_palpite TIMESTAMPTZ,
        ultimo_palpite TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await getPool().query(`
      CREATE INDEX IF NOT EXISTS idx_solar_2r_palpites_user_key
      ON solar_segunda_rodada_palpites (user_key);
    `);

    await getPool().query(`
      CREATE INDEX IF NOT EXISTS idx_solar_2r_palpites_game_id
      ON solar_segunda_rodada_palpites (game_id);
    `);

    tablesReady = true;
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function getUserKey(req) {
    const session = req.session || {};
    const user = session.user || session.usuario || session.authUser || {};

    const values = [
      req.body && req.body.clientUserKey,
      req.body && req.body.userKey,
      req.query && req.query.clientUserKey,
      req.query && req.query.userKey,
      user.telefone,
      user.phone,
      user.whatsapp,
      user.celular,
      user.email,
      user.id,
      user.codigo,
      session.telefone,
      session.phone,
      session.whatsapp,
      session.email,
      session.userId,
      session.usuarioId,
      req.sessionID
    ];

    for (const item of values) {
      const value = clean(item);
      if (value) return value.slice(0, 180);
    }

    return "";
  }

  function parseScore(value, label) {
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error(label + " obrigatório.");
    }

    const number = Number(value);

    if (!Number.isInteger(number) || number < 0 || number > 99) {
      throw new Error(label + " inválido.");
    }

    return number;
  }

  function lockInfo(gameId) {
    const game = GAMES[gameId];
    if (!game) return null;

    const startAt = new Date(game[4]);
    const lockedAt = new Date(startAt.getTime() - LOCK_MINUTES * 60 * 1000);
    const now = new Date();

    return {
      locked: now.getTime() >= lockedAt.getTime(),
      startAt,
      lockedAt,
      now
    };
  }

  function formatBrasilia(date) {
    try {
      return date.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (error) {
      return date.toISOString();
    }
  }

  function blocked(res, gameId, info) {
    return res.status(423).json({
      ok: false,
      success: false,
      code: "SOLAR_2R_BET_LOCKED",
      message: "Aposta bloqueada: o prazo encerra 15 minutos antes do jogo no horário de Brasília.",
      gameId,
      lockedAtBrasilia: formatBrasilia(info.lockedAt),
      startAtBrasilia: formatBrasilia(info.startAt),
      serverNowBrasilia: formatBrasilia(info.now)
    });
  }

  async function refreshPointsForUser(userKey) {
    await ensureTables();

    const key = clean(userKey);
    if (!key) return null;

    await getPool().query(
      `DELETE FROM solar_segunda_rodada_pontos WHERE user_key = $1`,
      [key]
    );

    const result = await getPool().query(
      `
        INSERT INTO solar_segunda_rodada_pontos (
          user_key,
          palpites_salvos,
          pontos_segunda_rodada,
          rodada_completa,
          total_jogos,
          primeiro_palpite,
          ultimo_palpite,
          updated_at
        )
        SELECT
          user_key,
          COUNT(DISTINCT game_id)::int AS palpites_salvos,
          COUNT(DISTINCT game_id)::int AS pontos_segunda_rodada,
          CASE WHEN COUNT(DISTINCT game_id) = 24 THEN TRUE ELSE FALSE END AS rodada_completa,
          24 AS total_jogos,
          MIN(created_at) AS primeiro_palpite,
          MAX(updated_at) AS ultimo_palpite,
          NOW() AS updated_at
        FROM solar_segunda_rodada_palpites
        WHERE user_key = $1
          AND game_id = ANY($2::text[])
        GROUP BY user_key
        RETURNING *
      `,
      [key, GAME_IDS]
    );

    return result.rows[0] || {
      user_key: key,
      palpites_salvos: 0,
      pontos_segunda_rodada: 0,
      rodada_completa: false,
      total_jogos: 24
    };
  }

  async function refreshAllPoints() {
    await ensureTables();

    await getPool().query(`DELETE FROM solar_segunda_rodada_pontos`);

    await getPool().query(
      `
        INSERT INTO solar_segunda_rodada_pontos (
          user_key,
          palpites_salvos,
          pontos_segunda_rodada,
          rodada_completa,
          total_jogos,
          primeiro_palpite,
          ultimo_palpite,
          updated_at
        )
        SELECT
          user_key,
          COUNT(DISTINCT game_id)::int AS palpites_salvos,
          COUNT(DISTINCT game_id)::int AS pontos_segunda_rodada,
          CASE WHEN COUNT(DISTINCT game_id) = 24 THEN TRUE ELSE FALSE END AS rodada_completa,
          24 AS total_jogos,
          MIN(created_at) AS primeiro_palpite,
          MAX(updated_at) AS ultimo_palpite,
          NOW() AS updated_at
        FROM solar_segunda_rodada_palpites
        WHERE game_id = ANY($1::text[])
        GROUP BY user_key
      `,
      [GAME_IDS]
    );
  }

  






// === RANKING GERAL ACUMULADO COM SEGUNDA RODADA START ===
app.get("/api/segunda-rodada-neon/ranking", async function (req, res) {
  try {
    await ensureTables();

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
        old_user_key TEXT PRIMARY KEY,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const primeiraRodada = await getPool().query(`
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_code,
        u.activation_origin,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
          NULLIF(TRIM(u.username), ''),
          NULLIF(TRIM(u.phone), ''),
          'Usuário ' || u.id::text
        ) AS name,
        COUNT(p.id)::int AS predictions_count,
        COALESCE(SUM(
          CASE
            WHEN p.id IS NULL THEN 0
            ELSE
              1
              +
              CASE
                WHEN r.home_score IS NULL OR r.away_score IS NULL THEN 0
                WHEN SIGN(p.home_score - p.away_score) = SIGN(r.home_score - r.away_score) THEN 3
                ELSE 0
              END
              +
              CASE
                WHEN r.home_score IS NULL OR r.away_score IS NULL THEN 0
                WHEN p.home_score = r.home_score AND p.away_score = r.away_score THEN 2
                ELSE 0
              END
          END
        ), 0)::int AS pontos_primeira_rodada,
        MAX(p.updated_at) AS ultimo_palpite_1r
      FROM users u
      LEFT JOIN predictions p
        ON p.user_id = u.id
      LEFT JOIN match_results r
        ON r.match_id = p.match_id
      GROUP BY
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.activation_code,
        u.activation_origin
    `);

    const segundaRodada = await getPool().query(`
      SELECT
        COALESCE(v.real_user_key, p.user_key) AS user_key_classificacao,
        COUNT(DISTINCT p.game_id)::int AS palpites_segunda_rodada,
        COUNT(DISTINCT p.game_id)::int AS pontos_segunda_rodada,
        CASE WHEN COUNT(DISTINCT p.game_id) >= 24 THEN TRUE ELSE FALSE END AS rodada_2_completa,
        MIN(p.created_at) AS primeiro_palpite_2r,
        MAX(p.updated_at) AS ultimo_palpite_2r,
        ARRAY_AGG(DISTINCT p.user_key) AS chaves_origem_2r
      FROM solar_segunda_rodada_palpites p
      LEFT JOIN solar_2r_user_key_vinculos v
        ON v.old_user_key = p.user_key
      WHERE p.game_id IS NOT NULL
      GROUP BY COALESCE(v.real_user_key, p.user_key)
    `);

    function digits(value) {
      return String(value || "").replace(/\D/g, "");
    }

    function norm(value) {
      return String(value || "").trim().toLowerCase();
    }

    const segundaMap = new Map();

    segundaRodada.rows.forEach(function (row) {
      const data = {
        userKey: row.user_key_classificacao,
        palpitesSegundaRodada: Number(row.palpites_segunda_rodada || 0),
        pointsSecondRound: Number(row.pontos_segunda_rodada || 0),
        rodada2Completa: Boolean(row.rodada_2_completa),
        ultimoPalpite2R: row.ultimo_palpite_2r || null,
        chavesOrigem2R: row.chaves_origem_2r || []
      };

      const keys = [
        row.user_key_classificacao,
        digits(row.user_key_classificacao)
      ];

      if (Array.isArray(row.chaves_origem_2r)) {
        row.chaves_origem_2r.forEach(function (k) {
          keys.push(k);
          keys.push(digits(k));
        });
      }

      keys.forEach(function (key) {
        const clean = norm(key);
        if (clean) segundaMap.set(clean, data);
      });
    });

    const used2R = new Set();

    const ranking = primeiraRodada.rows.map(function (user) {
      const possibleKeys = [
        user.phone,
        digits(user.phone),
        user.username,
        user.id,
        user.name
      ].map(norm).filter(Boolean);

      let found2R = null;

      for (const key of possibleKeys) {
        if (segundaMap.has(key)) {
          found2R = segundaMap.get(key);
          break;
        }
      }

      if (found2R) {
        used2R.add(norm(found2R.userKey));

        if (Array.isArray(found2R.chavesOrigem2R)) {
          found2R.chavesOrigem2R.forEach(function (k) {
            used2R.add(norm(k));
          });
        }
      }

      const pointsFirstRound = Number(user.pontos_primeira_rodada || 0);
      const pointsSecondRound = found2R ? Number(found2R.pointsSecondRound || 0) : 0;
      const total = pointsFirstRound + pointsSecondRound;

      return {
        id: user.id,
        userId: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        activationCode: user.activation_code || "",
        activationOrigin: user.activation_origin || "Público Instagram",
        name: user.name,
        displayName: user.name,
        predictionsCount: Number(user.predictions_count || 0),
        pointsFirstRound,
        pointsSecondRound,
        palpitesSegundaRodada: found2R ? Number(found2R.palpitesSegundaRodada || 0) : 0,
        jaPalpitouSegundaRodada: found2R ? Number(found2R.palpitesSegundaRodada || 0) > 0 : false,
        rodada2Completa: found2R ? Boolean(found2R.rodada2Completa) : false,
        ultimoPalpite2R: found2R ? found2R.ultimoPalpite2R : null,
        userKeySegundaRodada: found2R ? found2R.userKey : null,
        chavesOrigem2R: found2R ? found2R.chavesOrigem2R : [],
        points: total,
        totalPoints: total,
        pontos: total,
        total_pontos: total,
        pontos_primeira_rodada: pointsFirstRound,
        pontos_segunda_rodada: pointsSecondRound,
        total_com_segunda_rodada: total,
        origemRanking: "usuario"
      };
    });

    segundaRodada.rows.forEach(function (row) {
      const key = norm(row.user_key_classificacao);
      const origemKeys = Array.isArray(row.chaves_origem_2r) ? row.chaves_origem_2r.map(norm) : [];

      const alreadyUsed =
        used2R.has(key) ||
        origemKeys.some(function (k) {
          return used2R.has(k);
        });

      if (alreadyUsed) return;

      const raw = String(row.user_key_classificacao || "").trim();

      const name = raw.startsWith("local-")
        ? "Jogador " + String(raw.split("-").pop() || raw).slice(0, 6).toUpperCase()
        : raw || "Participante 2ª rodada";

      const pointsSecondRound = Number(row.pontos_segunda_rodada || 0);

      ranking.push({
        id: "2r-" + raw,
        userId: null,
        username: name,
        firstName: "",
        lastName: "",
        phone: "",
        activationCode: "",
        activationOrigin: "2ª rodada",
        name,
        displayName: name,
        predictionsCount: 0,
        pointsFirstRound: 0,
        pointsSecondRound,
        palpitesSegundaRodada: Number(row.palpites_segunda_rodada || 0),
        jaPalpitouSegundaRodada: Number(row.palpites_segunda_rodada || 0) > 0,
        rodada2Completa: Boolean(row.rodada_2_completa),
        ultimoPalpite2R: row.ultimo_palpite_2r || null,
        userKeySegundaRodada: raw,
        chavesOrigem2R: row.chaves_origem_2r || [],
        points: pointsSecondRound,
        totalPoints: pointsSecondRound,
        pontos: pointsSecondRound,
        total_pontos: pointsSecondRound,
        pontos_primeira_rodada: 0,
        pontos_segunda_rodada: pointsSecondRound,
        total_com_segunda_rodada: pointsSecondRound,
        origemRanking: "somente_2r"
      });
    });

    ranking.sort(function (a, b) {
      if (Number(b.points) !== Number(a.points)) return Number(b.points) - Number(a.points);
      if (Number(b.pointsSecondRound) !== Number(a.pointsSecondRound)) return Number(b.pointsSecondRound) - Number(a.pointsSecondRound);
      if (Number(b.palpitesSegundaRodada) !== Number(a.palpitesSegundaRodada)) return Number(b.palpitesSegundaRodada) - Number(a.palpitesSegundaRodada);
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });

    ranking.forEach(function (row, index) {
      row.position = index + 1;
      row.posicao = index + 1;
    });

    const resumo = {
      totalUsuarios: ranking.length,
      totalUsuariosQueJaPalpitaram2R: ranking.filter(function (user) {
        return Number(user.palpitesSegundaRodada || 0) > 0;
      }).length,
      totalUsuariosSomente2R: ranking.filter(function (user) {
        return user.origemRanking === "somente_2r";
      }).length,
      totalPontosPrimeiraRodada: ranking.reduce(function (sum, user) {
        return sum + Number(user.pointsFirstRound || 0);
      }, 0),
      totalPontosSegundaRodada: ranking.reduce(function (sum, user) {
        return sum + Number(user.pointsSecondRound || 0);
      }, 0),
      totalPontosGeral: ranking.reduce(function (sum, user) {
        return sum + Number(user.points || 0);
      }, 0)
    };

    return res.json({
      ok: true,
      success: true,
      source: "neon",
      rankingMode: "ranking_unico_soma_real_1r_2r",
      roundCode: "geral",
      resumo,
      totalUsuarios: ranking.length,
      totalUsuariosQueJaPalpitaram2R: resumo.totalUsuariosQueJaPalpitaram2R,
      ranking,
      leaderboard: ranking
    });
  } catch (error) {
    console.error("Erro ranking único soma real 1R + 2R:", error);

    return res.status(500).json({
      ok: false,
      success: false,
      error: "Erro ao carregar ranking geral somado.",
      details: String(error.message || error)
    });
  }
});

app.get("/api/ranking/segunda-rodada", async function (req, res) {
  return res.redirect(307, "/api/segunda-rodada-neon/ranking");
});
// === RANKING GERAL ACUMULADO COM SEGUNDA RODADA END ===

app.get("/api/segunda-rodada-neon/status", async function (req, res) {
    try {
      await ensureTables();
      await refreshAllPoints();

      const palpites = await getPool().query(
        "SELECT COUNT(*)::int AS total FROM solar_segunda_rodada_palpites WHERE game_id = ANY($1::text[])",
        [GAME_IDS]
      );

      const pontos = await getPool().query(
        "SELECT COUNT(*)::int AS total_usuarios, COALESCE(SUM(pontos_segunda_rodada), 0)::int AS total_pontos FROM solar_segunda_rodada_pontos"
      );

      return res.json({
        ok: true,
        success: true,
        neon: true,
        tablePalpites: "solar_segunda_rodada_palpites",
        tablePontos: "solar_segunda_rodada_pontos",
        totalPalpites: palpites.rows[0].total,
        totalUsuariosPontuados: pontos.rows[0].total_usuarios,
        totalPontosSegundaRodada: pontos.rows[0].total_pontos,
        regra: "1 palpite salvo = 1 ponto"
      });
    } catch (error) {
      console.error("Erro status Neon 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao verificar Neon."
      });
    }
  });

  app.get("/api/segunda-rodada-neon/palpites", async function (req, res) {
    try {
      await ensureTables();

      const userKey = getUserKey(req);

      if (!userKey) {
        return res.status(401).json({
          ok: false,
          success: false,
          message: "Usuário não identificado."
        });
      }

      const result = await getPool().query(
        `
          SELECT
            game_id,
            game_date,
            group_code,
            home_team,
            away_team,
            home_score,
            away_score,
            updated_at
          FROM solar_segunda_rodada_palpites
          WHERE user_key = $1
            AND game_id = ANY($2::text[])
          ORDER BY game_date, game_id
        `,
        [userKey, GAME_IDS]
      );

      const pontos = await refreshPointsForUser(userKey);

      return res.json({
        ok: true,
        success: true,
        neon: true,
        userKey,
        palpites: result.rows,
        pontos
      });
    } catch (error) {
      console.error("Erro carregar palpites Neon 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao carregar palpites."
      });
    }
  });

  
// === 2R USUARIO REAL AUTOMATICO NO SALVAMENTO START ===
app.use("/api/segunda-rodada-neon/palpites", async function solar2rUserKeyRealAutomatico(req, res, next) {
  try {
    if (!req || !req.body || typeof req.body !== "object") {
      return next();
    }

    const method = String(req.method || "").toUpperCase();

    if (method !== "POST" && method !== "DELETE") {
      return next();
    }

    function onlyDigits(value) {
      return String(value || "").replace(/\D/g, "");
    }

    function pickRealUserKeyFromSession() {
      const sessionUser = req.session && req.session.user ? req.session.user : null;

      if (!sessionUser) {
        return "";
      }

      const phone = onlyDigits(sessionUser.phone || sessionUser.telefone || sessionUser.whatsapp);

      if (phone) {
        return phone;
      }

      if (sessionUser.username) {
        return String(sessionUser.username).trim();
      }

      if (sessionUser.id) {
        return String(sessionUser.id).trim();
      }

      return "";
    }

    const originalKey = String(
      req.body.clientUserKey ||
      req.body.userKey ||
      req.body.user_key ||
      ""
    ).trim();

    const realUserKey = pickRealUserKeyFromSession();

    if (realUserKey) {
      req.body.originalClientUserKey = originalKey || null;
      req.body.clientUserKey = realUserKey;
      req.body.userKey = realUserKey;
      req.body.user_key = realUserKey;

      if (
        originalKey &&
        originalKey !== realUserKey &&
        /^(local|anon|guest)-/i.test(originalKey) &&
        typeof getPool === "function"
      ) {
        try {
          await getPool().query(`
            CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
              old_user_key TEXT PRIMARY KEY,
              real_user_key TEXT NOT NULL,
              real_phone TEXT,
              real_name TEXT,
              origem TEXT DEFAULT 'auto-salvamento',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
          `);

          const sessionUser = req.session && req.session.user ? req.session.user : {};
          const realName =
            [sessionUser.first_name, sessionUser.last_name].filter(Boolean).join(" ").trim() ||
            sessionUser.username ||
            realUserKey;

          await getPool().query(
            `
              INSERT INTO solar_2r_user_key_vinculos (
                old_user_key,
                real_user_key,
                real_phone,
                real_name,
                origem,
                created_at,
                updated_at
              )
              VALUES ($1, $2, $3, $4, 'auto-salvamento', NOW(), NOW())
              ON CONFLICT (old_user_key)
              DO UPDATE SET
                real_user_key = EXCLUDED.real_user_key,
                real_phone = EXCLUDED.real_phone,
                real_name = EXCLUDED.real_name,
                origem = EXCLUDED.origem,
                updated_at = NOW()
            `,
            [originalKey, realUserKey, onlyDigits(realUserKey), realName]
          );
        } catch (vinculoError) {
          console.warn("Aviso: não foi possível registrar vínculo automático 2R:", vinculoError.message);
        }
      }
    }

    return next();
  } catch (error) {
    console.warn("Aviso: middleware usuário real 2R falhou:", error.message);
    return next();
  }
});
// === 2R USUARIO REAL AUTOMATICO NO SALVAMENTO END ===

app.post("/api/segunda-rodada-neon/palpites", async function (req, res) {
    try {
      await ensureTables();

      const userKey = getUserKey(req);
      const gameId = clean(req.body && req.body.gameId);
      const game = GAMES[gameId];

      if (!userKey) {
        return res.status(401).json({
          ok: false,
          success: false,
          message: "Usuário não identificado."
        });
      }

      if (!game) {
        return res.status(400).json({
          ok: false,
          success: false,
          message: "Jogo da 2ª rodada não reconhecido.",
          gameId
        });
      }

      const info = lockInfo(gameId);

      if (info && info.locked) {
        return blocked(res, gameId, info);
      }

      const homeScore = parseScore(req.body && req.body.homeScore, "Placar do mandante");
      const awayScore = parseScore(req.body && req.body.awayScore, "Placar do visitante");

      const result = await getPool().query(
        `
          INSERT INTO solar_segunda_rodada_palpites (
            user_key,
            game_id,
            round_code,
            game_date,
            group_code,
            home_team,
            away_team,
            home_score,
            away_score,
            source,
            created_at,
            updated_at
          )
          VALUES ($1, $2, '2', $3, $4, $5, $6, $7, $8, 'app', NOW(), NOW())
          ON CONFLICT (user_key, game_id)
          DO UPDATE SET
            game_date = EXCLUDED.game_date,
            group_code = EXCLUDED.group_code,
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            source = 'app',
            updated_at = NOW()
          RETURNING
            id,
            user_key,
            game_id,
            game_date,
            group_code,
            home_team,
            away_team,
            home_score,
            away_score,
            updated_at
        `,
        [
          userKey,
          gameId,
          game[0],
          game[1],
          game[2],
          game[3],
          homeScore,
          awayScore
        ]
      );

      const pontos = await refreshPointsForUser(userKey);

      return res.json({
        ok: true,
        success: true,
        neon: true,
        message: "Palpite salvo.",
        palpite: result.rows[0],
        pontos
      });
    } catch (error) {
      console.error("Erro salvar palpite Neon 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao salvar palpite."
      });
    }
  });

  app.delete("/api/segunda-rodada-neon/palpites/:gameId", async function (req, res) {
    try {
      await ensureTables();

      const userKey = getUserKey(req);
      const gameId = clean(req.params && req.params.gameId);
      const game = GAMES[gameId];

      if (!userKey) {
        return res.status(401).json({
          ok: false,
          success: false,
          message: "Usuário não identificado."
        });
      }

      if (!game) {
        return res.status(400).json({
          ok: false,
          success: false,
          message: "Jogo da 2ª rodada não reconhecido.",
          gameId
        });
      }

      const info = lockInfo(gameId);

      if (info && info.locked) {
        return blocked(res, gameId, info);
      }

      await getPool().query(
        `
          DELETE FROM solar_segunda_rodada_palpites
          WHERE user_key = $1
            AND game_id = $2
        `,
        [userKey, gameId]
      );

      const pontos = await refreshPointsForUser(userKey);

      return res.json({
        ok: true,
        success: true,
        neon: true,
        message: "Palpite removido.",
        gameId,
        pontos
      });
    } catch (error) {
      console.error("Erro resetar palpite Neon 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao resetar palpite."
      });
    }
  });

  app.post("/api/segunda-rodada-neon/sincronizar-usuario", async function (req, res) {
    try {
      await ensureTables();

      const oldUserKey = clean(req.body && req.body.oldUserKey);
      const newUserKey = clean(req.body && req.body.newUserKey);

      if (!oldUserKey || !newUserKey || oldUserKey === newUserKey) {
        return res.json({
          ok: true,
          success: true,
          migrated: false,
          message: "Nada para sincronizar."
        });
      }

      await getPool().query(
        `
          INSERT INTO solar_segunda_rodada_palpites (
            user_key,
            game_id,
            round_code,
            game_date,
            group_code,
            home_team,
            away_team,
            home_score,
            away_score,
            source,
            created_at,
            updated_at
          )
          SELECT
            $2 AS user_key,
            game_id,
            round_code,
            game_date,
            group_code,
            home_team,
            away_team,
            home_score,
            away_score,
            'migrado-local' AS source,
            created_at,
            updated_at
          FROM solar_segunda_rodada_palpites
          WHERE user_key = $1
            AND game_id = ANY($3::text[])
          ON CONFLICT (user_key, game_id)
          DO UPDATE SET
            game_date = EXCLUDED.game_date,
            group_code = EXCLUDED.group_code,
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            source = 'migrado-local',
            updated_at = GREATEST(solar_segunda_rodada_palpites.updated_at, EXCLUDED.updated_at)
        `,
        [oldUserKey, newUserKey, GAME_IDS]
      );

      if (/^(local-|anon-|guest-)/i.test(oldUserKey)) {
        await getPool().query(
          `
            DELETE FROM solar_segunda_rodada_palpites
            WHERE user_key = $1
              AND game_id = ANY($2::text[])
          `,
          [oldUserKey, GAME_IDS]
        );
      }

      await refreshPointsForUser(oldUserKey);
      const pontos = await refreshPointsForUser(newUserKey);

      return res.json({
        ok: true,
        success: true,
        migrated: true,
        oldUserKey,
        newUserKey,
        pontos
      });
    } catch (error) {
      console.error("Erro sincronizar usuário 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao sincronizar usuário."
      });
    }
  });

  app.get("/api/admin/segunda-rodada-neon/pontos", async function (req, res) {
    try {
      await ensureTables();
      await refreshAllPoints();

      const total = await getPool().query(
        `
          SELECT
            COUNT(*)::int AS total_usuarios,
            COALESCE(SUM(palpites_salvos), 0)::int AS total_palpites,
            COALESCE(SUM(pontos_segunda_rodada), 0)::int AS total_pontos,
            COUNT(*) FILTER (WHERE rodada_completa = TRUE)::int AS usuarios_com_rodada_completa
          FROM solar_segunda_rodada_pontos
        `
      );

      const ranking = await getPool().query(
        `
          SELECT
            user_key,
            palpites_salvos,
            pontos_segunda_rodada,
            GREATEST(24 - palpites_salvos, 0)::int AS faltam,
            rodada_completa,
            CASE
              WHEN rodada_completa = TRUE THEN 'RODADA COMPLETA'
              ELSE 'INCOMPLETO'
            END AS status_rodada,
            primeiro_palpite,
            ultimo_palpite,
            updated_at
          FROM solar_segunda_rodada_pontos
          ORDER BY
            pontos_segunda_rodada DESC,
            ultimo_palpite DESC,
            user_key ASC
        `
      );

      return res.json({
        ok: true,
        success: true,
        regra: "1 palpite salvo = 1 ponto",
        totalJogosSegundaRodada: 24,
        resumo: {
          totalUsuarios: total.rows[0].total_usuarios,
          totalPalpites: total.rows[0].total_palpites,
          totalPontos: total.rows[0].total_pontos,
          usuariosComRodadaCompleta: total.rows[0].usuarios_com_rodada_completa
        },
        ranking: ranking.rows,
        atualizadoEm: new Date().toISOString()
      });
    } catch (error) {
      console.error("Erro admin pontos 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao carregar pontuação da 2ª rodada."
      });
    }
  });

  console.log("Pontuação global da 2ª rodada carregada.");
})();
// SOLAR_2R_PONTUACAO_GLOBAL_BACKEND_END

// SOLAR_2R_AUTO_VINCULO_GERAL_START
(function instalarAutoVinculoGeral2R() {
  const fs = require("fs");
  const path = require("path");
  const { Pool } = require("pg");

  function loadEnvIfNeeded() {
    const exists =
      process.env.DATABASE_URL ||
      process.env.NEON_DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL;

    if (exists) return;

    const envPath = path.join(__dirname, ".env");
    if (!fs.existsSync(envPath)) return;

    fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach(function (line) {
      const clean = line.trim();
      if (!clean || clean.startsWith("#")) return;

      const index = clean.indexOf("=");
      if (index === -1) return;

      const key = clean.slice(0, index).trim();
      let value = clean.slice(index + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) process.env[key] = value;
    });
  }

  loadEnvIfNeeded();

  const DATABASE_URL =
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";

  let pool = null;

  function getPool() {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL / NEON_DATABASE_URL não configurada.");
    }

    if (!pool) {
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1")
          ? false
          : { rejectUnauthorized: false },
        max: 8
      });
    }

    return pool;
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function digits(value) {
    return clean(value).replace(/\D+/g, "");
  }

  function normalizePhone(value) {
    let d = digits(value);

    if (d.length === 13 && d.indexOf("55") === 0) {
      d = d.slice(2);
    }

    return d;
  }

  function normalizeKey(value) {
    const raw = clean(value).toLowerCase();
    const phone = normalizePhone(raw);

    if (phone.length >= 10 && phone.length <= 11) return phone;

    return raw;
  }

  function firstValue() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = clean(arguments[i]);
      if (value) return value;
    }

    return "";
  }

  function getSessionUser(req) {
    const session = req.session || {};
    return (
      session.user ||
      session.usuario ||
      session.authUser ||
      session.currentUser ||
      session.participante ||
      {}
    );
  }

  function getRealIdentity(req) {
    const body = req.body || {};
    const query = req.query || {};
    const user = getSessionUser(req);
    const session = req.session || {};

    const phone = normalizePhone(firstValue(
      body.realPhone,
      body.phone,
      body.telefone,
      body.whatsapp,
      body.celular,
      body.clientUserPhone,
      query.realPhone,
      query.phone,
      query.telefone,
      user.phone,
      user.telefone,
      user.whatsapp,
      user.celular,
      session.phone,
      session.telefone,
      session.whatsapp,
      session.celular
    ));

    const explicitKey = firstValue(
      body.realUserKey,
      body.userKey,
      body.clientUserKeyReal,
      query.realUserKey,
      query.userKey
    );

    const sessionKey = firstValue(
      user.user_key,
      user.userKey,
      user.id,
      user.user_id,
      user.usuario_id,
      user.email,
      session.userKey,
      session.userId,
      session.usuarioId,
      session.email
    );

    let realUserKey = "";

    if (phone) {
      realUserKey = phone;
    } else if (explicitKey && !/^local-/i.test(explicitKey)) {
      realUserKey = explicitKey;
    } else if (sessionKey && !/^local-/i.test(sessionKey)) {
      realUserKey = sessionKey;
    }

    const name = firstValue(
      body.realName,
      body.name,
      body.nome,
      user.nomedeusuario,
      user.username,
      user.name,
      user.nome,
      [user.firstName || user.primeiroNome, user.lastName || user.sobrenome].filter(Boolean).join(" ")
    );

    return {
      realUserKey: clean(realUserKey),
      realPhone: phone,
      realName: name
    };
  }

  function getLocalKeysFromBody(req) {
    const body = req.body || {};
    const values = [];

    if (Array.isArray(body.localUserKeys)) {
      values.push.apply(values, body.localUserKeys);
    }

    [
      body.localUserKey,
      body.oldUserKey,
      body.previousLocalUserKey,
      body.clientUserKey,
      body.userKey
    ].forEach(function (value) {
      if (value) values.push(value);
    });

    const out = [];

    values.forEach(function (value) {
      const text = clean(value);
      const matches = text.match(/local-[a-z0-9][a-z0-9_-]*/gi) || [];

      matches.forEach(function (match) {
        if (match && /^local-/i.test(match)) out.push(match);
      });
    });

    return Array.from(new Set(out)).slice(0, 30);
  }

  async function ensureTables() {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
        id BIGSERIAL PRIMARY KEY,
        old_user_key TEXT NOT NULL UNIQUE,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT DEFAULT 'auto',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos_log (
        id BIGSERIAL PRIMARY KEY,
        old_user_key TEXT NOT NULL,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_segunda_rodada_pontos (
        user_key TEXT PRIMARY KEY,
        palpites_salvos INTEGER NOT NULL DEFAULT 0,
        pontos_segunda_rodada INTEGER NOT NULL DEFAULT 0,
        rodada_completa BOOLEAN NOT NULL DEFAULT FALSE,
        total_jogos INTEGER NOT NULL DEFAULT 24,
        primeiro_palpite TIMESTAMPTZ,
        ultimo_palpite TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async function recalcularPontos2R() {
    await ensureTables();

    await getPool().query(`DELETE FROM solar_segunda_rodada_pontos`);

    await getPool().query(`
      INSERT INTO solar_segunda_rodada_pontos (
        user_key,
        palpites_salvos,
        pontos_segunda_rodada,
        rodada_completa,
        total_jogos,
        primeiro_palpite,
        ultimo_palpite,
        updated_at
      )
      SELECT
        COALESCE(v.real_user_key, p.user_key) AS user_key,
        COUNT(DISTINCT p.game_id)::int AS palpites_salvos,
        COUNT(DISTINCT p.game_id)::int AS pontos_segunda_rodada,
        CASE WHEN COUNT(DISTINCT p.game_id) = 24 THEN TRUE ELSE FALSE END AS rodada_completa,
        24 AS total_jogos,
        MIN(p.created_at) AS primeiro_palpite,
        MAX(p.updated_at) AS ultimo_palpite,
        NOW() AS updated_at
      FROM solar_segunda_rodada_palpites p
      LEFT JOIN solar_2r_user_key_vinculos v
        ON v.old_user_key = p.user_key
      GROUP BY COALESCE(v.real_user_key, p.user_key)
    `);
  }

  async function vincularLocalKeys(localKeys, identity, origem) {
    await ensureTables();

    const vinculados = [];

    for (const localKey of localKeys) {
      const oldUserKey = clean(localKey);

      if (!oldUserKey || !/^local-/i.test(oldUserKey)) continue;
      if (!identity.realUserKey) continue;

      const existePalpite = await getPool().query(
        `
          SELECT COUNT(*)::int AS total
          FROM solar_segunda_rodada_palpites
          WHERE user_key = $1
        `,
        [oldUserKey]
      );

      if (!Number(existePalpite.rows[0].total || 0)) continue;

      await getPool().query(
        `
          INSERT INTO solar_2r_user_key_vinculos (
            old_user_key,
            real_user_key,
            real_phone,
            real_name,
            origem,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (old_user_key)
          DO UPDATE SET
            real_user_key = EXCLUDED.real_user_key,
            real_phone = EXCLUDED.real_phone,
            real_name = EXCLUDED.real_name,
            origem = EXCLUDED.origem,
            updated_at = NOW()
        `,
        [
          oldUserKey,
          identity.realUserKey,
          identity.realPhone || identity.realUserKey,
          identity.realName || null,
          origem || "auto"
        ]
      );

      await getPool().query(
        `
          INSERT INTO solar_2r_user_key_vinculos_log (
            old_user_key,
            real_user_key,
            real_phone,
            real_name,
            origem,
            payload,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
        `,
        [
          oldUserKey,
          identity.realUserKey,
          identity.realPhone || identity.realUserKey,
          identity.realName || null,
          origem || "auto",
          JSON.stringify({ automatico: true, data: new Date().toISOString() })
        ]
      );

      vinculados.push(oldUserKey);
    }

    if (vinculados.length) {
      await recalcularPontos2R();
    }

    return vinculados;
  }

  app.post("/api/segunda-rodada-neon/auto-vincular-usuario", async function (req, res) {
    try {
      const identity = getRealIdentity(req);
      const localKeys = getLocalKeysFromBody(req);

      if (!localKeys.length) {
        return res.json({
          ok: true,
          success: true,
          vinculado: false,
          motivo: "Nenhuma chave local-* enviada."
        });
      }

      if (!identity.realUserKey) {
        return res.json({
          ok: true,
          success: true,
          vinculado: false,
          motivo: "Usuário real ainda não identificado por sessão/localStorage.",
          localKeys
        });
      }

      const vinculados = await vincularLocalKeys(localKeys, identity, "auto-frontend");

      return res.json({
        ok: true,
        success: true,
        vinculado: vinculados.length > 0,
        vinculados,
        realUserKey: identity.realUserKey,
        realPhone: identity.realPhone || null,
        realName: identity.realName || null
      });
    } catch (error) {
      console.error("Erro auto-vincular usuário 2R:", error);

      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao auto-vincular usuário."
      });
    }
  });

  app.get("/api/admin/segunda-rodada-neon/auto-vinculos", async function (req, res) {
    try {
      await ensureTables();

      const vinculados = await getPool().query(`
        SELECT
          v.old_user_key,
          v.real_user_key,
          v.real_phone,
          v.real_name,
          v.origem,
          v.updated_at,
          COUNT(DISTINCT p.game_id)::int AS palpites_vinculados
        FROM solar_2r_user_key_vinculos v
        LEFT JOIN solar_segunda_rodada_palpites p
          ON p.user_key = v.old_user_key
        GROUP BY
          v.old_user_key,
          v.real_user_key,
          v.real_phone,
          v.real_name,
          v.origem,
          v.updated_at
        ORDER BY v.updated_at DESC
      `);

      const pendentes = await getPool().query(`
        SELECT
          p.user_key,
          COUNT(DISTINCT p.game_id)::int AS palpites_salvos,
          MIN(p.created_at) AS primeiro_palpite,
          MAX(p.updated_at) AS ultimo_palpite
        FROM solar_segunda_rodada_palpites p
        LEFT JOIN solar_2r_user_key_vinculos v
          ON v.old_user_key = p.user_key
        WHERE p.user_key LIKE 'local-%'
          AND v.old_user_key IS NULL
        GROUP BY p.user_key
        ORDER BY COUNT(DISTINCT p.game_id) DESC, MAX(p.updated_at) DESC
      `);

      return res.json({
        ok: true,
        success: true,
        vinculados: vinculados.rows,
        pendentes: pendentes.rows
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao consultar vínculos."
      });
    }
  });

  
// === VINCULO MANUAL 2R AO USUARIO REAL START ===
app.get("/api/admin/segunda-rodada-neon/vinculos-diagnostico", async function (req, res) {
  try {
    await ensureTables();

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
        old_user_key TEXT PRIMARY KEY,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const usuarios = await getPool().query(`
      SELECT
        id,
        username,
        first_name,
        last_name,
        phone,
        COALESCE(username, CONCAT_WS(' ', first_name, last_name), phone, id::text) AS nome
      FROM users
      ORDER BY username ASC, first_name ASC, phone ASC
    `);

    const locais = await getPool().query(`
      SELECT
        p.user_key,
        COUNT(DISTINCT p.game_id)::int AS palpites,
        MIN(p.created_at) AS primeiro_palpite,
        MAX(p.updated_at) AS ultimo_palpite,
        v.real_user_key,
        v.real_phone,
        v.real_name
      FROM solar_segunda_rodada_palpites p
      LEFT JOIN solar_2r_user_key_vinculos v
        ON v.old_user_key = p.user_key
      WHERE p.user_key LIKE 'local-%'
         OR p.user_key LIKE 'anon-%'
         OR p.user_key LIKE 'guest-%'
      GROUP BY
        p.user_key,
        v.real_user_key,
        v.real_phone,
        v.real_name
      ORDER BY
        COUNT(DISTINCT p.game_id) DESC,
        MAX(p.updated_at) DESC
    `);

    return res.json({
      ok: true,
      success: true,
      usuarios: usuarios.rows,
      chavesLocais: locais.rows
    });
  } catch (error) {
    console.error("Erro diagnóstico vínculos 2R:", error);

    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || "Erro no diagnóstico de vínculos."
    });
  }
});

app.post("/api/admin/segunda-rodada-neon/vincular-local", async function (req, res) {
  try {
    await ensureTables();

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
        old_user_key TEXT PRIMARY KEY,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const oldUserKey = String(
      (req.body && (req.body.oldUserKey || req.body.localUserKey || req.body.userKey)) || ""
    ).trim();

    const phone = String(
      (req.body && (req.body.phone || req.body.realPhone || req.body.telefone)) || ""
    ).replace(/\D/g, "");

    if (!oldUserKey) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Informe oldUserKey."
      });
    }

    if (!phone) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: "Informe phone."
      });
    }

    const userResult = await getPool().query(
      `
        SELECT
          id,
          username,
          first_name,
          last_name,
          phone
        FROM users
        WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
        LIMIT 1
      `,
      [phone]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: "Usuário real não encontrado pelo telefone informado."
      });
    }

    const user = userResult.rows[0];
    const realName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || user.phone || String(user.id);

    const existePalpite = await getPool().query(
      `
        SELECT COUNT(DISTINCT game_id)::int AS total
        FROM solar_segunda_rodada_palpites
        WHERE user_key = $1
      `,
      [oldUserKey]
    );

    if (!Number(existePalpite.rows[0].total || 0)) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: "Essa chave local não possui palpites da 2ª rodada."
      });
    }

    await getPool().query(
      `
        INSERT INTO solar_2r_user_key_vinculos (
          old_user_key,
          real_user_key,
          real_phone,
          real_name,
          origem,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, 'manual-admin', NOW(), NOW())
        ON CONFLICT (old_user_key)
        DO UPDATE SET
          real_user_key = EXCLUDED.real_user_key,
          real_phone = EXCLUDED.real_phone,
          real_name = EXCLUDED.real_name,
          origem = EXCLUDED.origem,
          updated_at = NOW()
      `,
      [oldUserKey, phone, phone, realName]
    );

    if (typeof recalcularPontos2R === "function") {
      await recalcularPontos2R();
    }

    return res.json({
      ok: true,
      success: true,
      message: "Chave local vinculada ao usuário real.",
      oldUserKey,
      realUserKey: phone,
      realPhone: phone,
      realName,
      palpitesVinculados: Number(existePalpite.rows[0].total || 0)
    });
  } catch (error) {
    console.error("Erro vínculo manual 2R:", error);

    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || "Erro ao vincular chave local."
    });
  }
});
// === VINCULO MANUAL 2R AO USUARIO REAL END ===


// === AUTO VINCULAR 2R IDENTIFICAVEIS START ===
app.post("/api/admin/segunda-rodada-neon/vincular-identificaveis", async function (req, res) {
  try {
    await ensureTables();

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
        old_user_key TEXT PRIMARY KEY,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT DEFAULT 'auto-identificavel',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const identificaveis = await getPool().query(`
      WITH usuarios AS (
        SELECT
          id,
          username,
          first_name,
          last_name,
          regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') AS phone_digits,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''),
            NULLIF(TRIM(username), ''),
            NULLIF(TRIM(phone), ''),
            id::text
          ) AS real_name
        FROM users
      ),
      palpites AS (
        SELECT
          user_key,
          COUNT(DISTINCT game_id)::int AS palpites
        FROM solar_segunda_rodada_palpites
        WHERE game_id IS NOT NULL
        GROUP BY user_key
      ),
      matches AS (
        SELECT
          p.user_key AS old_user_key,
          u.phone_digits AS real_user_key,
          u.phone_digits AS real_phone,
          u.real_name,
          p.palpites,
          CASE
            WHEN regexp_replace(COALESCE(p.user_key, ''), '\\D', '', 'g') <> ''
             AND regexp_replace(COALESCE(p.user_key, ''), '\\D', '', 'g') = u.phone_digits
              THEN 'telefone'
            WHEN LOWER(TRIM(p.user_key)) = LOWER(TRIM(u.username))
              THEN 'username'
            WHEN LOWER(TRIM(p.user_key)) = LOWER(TRIM(u.id::text))
              THEN 'id'
            ELSE 'sem-match'
          END AS match_type
        FROM palpites p
        JOIN usuarios u
          ON (
            regexp_replace(COALESCE(p.user_key, ''), '\\D', '', 'g') <> ''
            AND regexp_replace(COALESCE(p.user_key, ''), '\\D', '', 'g') = u.phone_digits
          )
          OR LOWER(TRIM(p.user_key)) = LOWER(TRIM(u.username))
          OR LOWER(TRIM(p.user_key)) = LOWER(TRIM(u.id::text))
        WHERE p.user_key !~* '^(local|anon|guest)-'
          AND u.phone_digits <> ''
      )
      SELECT *
      FROM matches
      ORDER BY palpites DESC, old_user_key ASC
    `);

    let vinculados = [];

    for (const row of identificaveis.rows) {
      await getPool().query(
        `
          INSERT INTO solar_2r_user_key_vinculos (
            old_user_key,
            real_user_key,
            real_phone,
            real_name,
            origem,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (old_user_key)
          DO UPDATE SET
            real_user_key = EXCLUDED.real_user_key,
            real_phone = EXCLUDED.real_phone,
            real_name = EXCLUDED.real_name,
            origem = EXCLUDED.origem,
            updated_at = NOW()
        `,
        [
          row.old_user_key,
          row.real_user_key,
          row.real_phone,
          row.real_name,
          "auto-identificavel-" + row.match_type
        ]
      );

      vinculados.push(row);
    }

    if (typeof recalcularPontos2R === "function") {
      await recalcularPontos2R();
    }

    const pendentes = await getPool().query(`
      SELECT
        p.user_key,
        COUNT(DISTINCT p.game_id)::int AS palpites,
        MIN(p.created_at) AS primeiro_palpite,
        MAX(p.updated_at) AS ultimo_palpite
      FROM solar_segunda_rodada_palpites p
      LEFT JOIN solar_2r_user_key_vinculos v
        ON v.old_user_key = p.user_key
      WHERE p.game_id IS NOT NULL
        AND v.old_user_key IS NULL
        AND (
          p.user_key ~* '^(local|anon|guest)-'
          OR p.user_key IS NULL
          OR TRIM(p.user_key) = ''
        )
      GROUP BY p.user_key
      ORDER BY COUNT(DISTINCT p.game_id) DESC, MAX(p.updated_at) DESC
    `);

    const resumo = await getPool().query(`
      SELECT
        COUNT(*)::int AS total_vinculos
      FROM solar_2r_user_key_vinculos
    `);

    return res.json({
      ok: true,
      success: true,
      message: "Auto vínculo seguro concluído. Chaves locais sem identificação continuam pendentes.",
      vinculadosAutomaticamente: vinculados.length,
      vinculados,
      pendentesLocais: pendentes.rows,
      totalPendentesLocais: pendentes.rows.length,
      resumo: resumo.rows[0]
    });
  } catch (error) {
    console.error("Erro auto vínculo identificáveis 2R:", error);

    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || "Erro ao vincular identificáveis."
    });
  }
});

app.get("/api/admin/segunda-rodada-neon/pendentes-vinculo", async function (req, res) {
  try {
    await ensureTables();

    await getPool().query(`
      CREATE TABLE IF NOT EXISTS solar_2r_user_key_vinculos (
        old_user_key TEXT PRIMARY KEY,
        real_user_key TEXT NOT NULL,
        real_phone TEXT,
        real_name TEXT,
        origem TEXT DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const pendentes = await getPool().query(`
      SELECT
        p.user_key,
        COUNT(DISTINCT p.game_id)::int AS palpites,
        MIN(p.created_at) AS primeiro_palpite,
        MAX(p.updated_at) AS ultimo_palpite
      FROM solar_segunda_rodada_palpites p
      LEFT JOIN solar_2r_user_key_vinculos v
        ON v.old_user_key = p.user_key
      WHERE p.game_id IS NOT NULL
        AND v.old_user_key IS NULL
      GROUP BY p.user_key
      ORDER BY COUNT(DISTINCT p.game_id) DESC, MAX(p.updated_at) DESC
    `);

    return res.json({
      ok: true,
      success: true,
      totalPendentes: pendentes.rows.length,
      pendentes: pendentes.rows
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || "Erro ao listar pendentes."
    });
  }
});
// === AUTO VINCULAR 2R IDENTIFICAVEIS END ===

app.post("/api/admin/segunda-rodada-neon/recalcular-pontos", async function (req, res) {
    try {
      await recalcularPontos2R();

      const resumo = await getPool().query(`
        SELECT
          COUNT(*)::int AS total_usuarios,
          COALESCE(SUM(palpites_salvos), 0)::int AS total_palpites,
          COALESCE(SUM(pontos_segunda_rodada), 0)::int AS total_pontos,
          COUNT(*) FILTER (WHERE rodada_completa = TRUE)::int AS usuarios_com_24_palpites
        FROM solar_segunda_rodada_pontos
      `);

      return res.json({
        ok: true,
        success: true,
        message: "Pontuação recalculada sem alterar palpites.",
        resumo: resumo.rows[0]
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        success: false,
        message: error.message || "Erro ao recalcular pontos."
      });
    }
  });

  function findRankingArray(payload) {
    if (Array.isArray(payload)) return payload;

    if (!payload || typeof payload !== "object") return null;

    const keys = [
      "classificação",
      "classificacao",
      "ranking",
      "leaderboard",
      "users",
      "usuarios",
      "participantes",
      "data",
      "rows",
      "items"
    ];

    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key];
    }

    if (payload.data && typeof payload.data === "object") {
      for (const key of keys) {
        if (Array.isArray(payload.data[key])) return payload.data[key];
      }
    }

    return null;
  }

  function rowKeys(row) {
    const keys = [];

    if (!row || typeof row !== "object") return keys;

    [
      "user_key",
      "userKey",
      "id",
      "user_id",
      "userId",
      "usuario_id",
      "usuarioId",
      "phone",
      "telefone",
      "whatsapp",
      "celular",
      "email"
    ].forEach(function (field) {
      if (row[field] !== undefined && row[field] !== null && clean(row[field])) {
        keys.push(clean(row[field]));
        keys.push(normalizeKey(row[field]));
        keys.push(normalizePhone(row[field]));
      }
    });

    return Array.from(new Set(keys.filter(Boolean)));
  }

  function getBasePoints(row) {
    if (row && row.pontos_sem_segunda_rodada !== undefined) {
      const base = Number(row.pontos_sem_segunda_rodada);
      if (Number.isFinite(base)) return base;
    }

    const fields = [
      "points",
      "pontos",
      "pontuacao",
      "pontuação",
      "score",
      "total",
      "totalPoints",
      "total_points",
      "pontos_total",
      "total_pontos"
    ];

    for (const field of fields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== "") {
        const n = Number(row[field]);
        if (Number.isFinite(n)) return n;
      }
    }

    return 0;
  }

  function setTotalPoints(row, total) {
    let changed = false;

    [
      "points",
      "pontos",
      "pontuacao",
      "pontuação",
      "score",
      "totalPoints",
      "total_points",
      "pontos_total",
      "total_pontos"
    ].forEach(function (field) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== "") {
        const n = Number(row[field]);

        if (Number.isFinite(n)) {
          row[field] = total;
          changed = true;
        }
      }
    });

    if (!changed) row.points = total;
  }

  async function loadPontosParaRanking() {
    await ensureTables();

    const result = await getPool().query(`
      SELECT
        COALESCE(v.real_user_key, p.user_key) AS user_key_classificacao,
        COUNT(DISTINCT p.game_id)::int AS palpites_salvos,
        COUNT(DISTINCT p.game_id)::int AS pontos_segunda_rodada,
        CASE WHEN COUNT(DISTINCT p.game_id) = 24 THEN TRUE ELSE FALSE END AS rodada_completa,
        ARRAY_AGG(DISTINCT p.user_key) AS chaves_origem
      FROM solar_segunda_rodada_palpites p
      LEFT JOIN solar_2r_user_key_vinculos v
        ON v.old_user_key = p.user_key
      GROUP BY COALESCE(v.real_user_key, p.user_key)
    `);

    const map = new Map();

    result.rows.forEach(function (row) {
      [
        row.user_key_classificacao,
        normalizeKey(row.user_key_classificacao),
        normalizePhone(row.user_key_classificacao)
      ].forEach(function (key) {
        key = clean(key);
        if (!key) return;

        map.set(key, {
          user_key_classificacao: row.user_key_classificacao,
          palpites_salvos: Number(row.palpites_salvos || 0),
          pontos_segunda_rodada: Number(row.pontos_segunda_rodada || 0),
          rodada_completa: !!row.rodada_completa,
          chaves_origem: row.chaves_origem || []
        });
      });
    });

    return map;
  }

  async function aplicar2RNoRanking(payload) {
    if (!payload) return payload;

    if (
      payload &&
      typeof payload === "object" &&
      payload.segundaRodada &&
      payload.segundaRodada.modo === "auto-vinculo-geral"
    ) {
      return payload;
    }

    const ranking = findRankingArray(payload);

    if (!ranking) return payload;

    const map = await loadPontosParaRanking();

    let usuariosComPontos = 0;
    let totalSomado = 0;

    ranking.forEach(function (row) {
      if (!row || typeof row !== "object") return;

      const keys = rowKeys(row);
      let found = null;

      for (const key of keys) {
        if (map.has(key)) {
          found = map.get(key);
          break;
        }
      }

      const base = getBasePoints(row);
      const extra = found ? Number(found.pontos_segunda_rodada || 0) : 0;
      const total = base + extra;

      row.pontos_sem_segunda_rodada = base;
      row.pontos_segunda_rodada = extra;
      row.pontos_2r = extra;
      row.total_com_segunda_rodada = total;
      row.palpites_segunda_rodada = found ? Number(found.palpites_salvos || 0) : 0;
      row.rodada_2_completa = found ? !!found.rodada_completa : false;
      row.user_key_segunda_rodada = found ? found.user_key_classificacao : null;
      row.chaves_origem_segunda_rodada = found ? found.chaves_origem : [];

      setTotalPoints(row, total);

      if (extra > 0) {
        usuariosComPontos += 1;
        totalSomado += extra;
      }
    });

    ranking.sort(function (a, b) {
      return Number(b.total_com_segunda_rodada || 0) - Number(a.total_com_segunda_rodada || 0);
    });

    ranking.forEach(function (row, index) {
      const pos = index + 1;
      row.position = pos;
      row.posicao = pos;
      row["posição"] = pos;
      row.posicao_com_segunda_rodada = pos;
    });

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.segundaRodada = {
        aplicada: true,
        modo: "auto-vinculo-geral",
        regra: "1 palpite salvo = 1 ponto",
        usuariosComPontos2R: usuariosComPontos,
        totalPontosSomados2R: totalSomado
      };
    }

    return payload;
  }

  function patchResponseBuffer(req, res) {
    if (res.__solar2rAutoVinculoPatched) return;

    res.__solar2rAutoVinculoPatched = true;

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks = [];

    res.write = function patchedWrite(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
      }

      if (typeof callback === "function") callback();

      return true;
    };

    res.end = function patchedEnd(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || "utf8"));
      }

      const buffer = Buffer.concat(chunks);
      const text = buffer.toString("utf8");
      const trimmed = text.trim();

      if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
        return originalEnd(buffer.length ? buffer : chunk, encoding, callback);
      }

      let parsed;

      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        return originalEnd(buffer.length ? buffer : chunk, encoding, callback);
      }

      Promise.resolve()
        .then(function () {
          return aplicar2RNoRanking(parsed);
        })
        .then(function (novo) {
          const output = JSON.stringify(novo);

          try {
            res.removeHeader("Content-Length");
          } catch (_) {}

          res.setHeader("Content-Type", "application/json; charset=utf-8");

          return originalEnd(output, "utf8", callback);
        })
        .catch(function (error) {
          console.error("[2R AUTO VINCULO] erro ao atualizar ranking:", error);
          return originalEnd(buffer.length ? buffer : chunk, encoding, callback);
        });
    };
  }

  function wrapRouteLayer(layer) {
    if (!layer || !layer.route || !layer.route.path || !layer.route.stack) return 0;

    const routePath = String(layer.route.path);

    const targets = [
      "/admin/neon-ranking",
      "/admin/leaderboard",
      "/admin/summary",
      "/admin/export-dashboard",
      "/admin/export-neon"
    ];

    if (!targets.includes(routePath)) return 0;
    if (!layer.route.methods || !layer.route.methods.get) return 0;

    let count = 0;

    layer.route.stack.forEach(function (routeLayer) {
      if (!routeLayer || typeof routeLayer.handle !== "function") return;
      if (routeLayer.handle.__solar2rAutoVinculoWrapped) return;

      const original = routeLayer.handle;

      routeLayer.handle = function wrappedAdminRoute2RAuto(req, res, next) {
        console.log("[2R AUTO VINCULO] atualizando ranking admin", req.method, req.originalUrl || req.url);
        patchResponseBuffer(req, res);
        return original.call(this, req, res, next);
      };

      routeLayer.handle.__solar2rAutoVinculoWrapped = true;
      count += 1;
    });

    return count;
  }

  function wrapStack(stack) {
    let total = 0;

    if (!Array.isArray(stack)) return total;

    stack.forEach(function (layer) {
      total += wrapRouteLayer(layer);

      if (layer && layer.handle && Array.isArray(layer.handle.stack)) {
        total += wrapStack(layer.handle.stack);
      }
    });

    return total;
  }

  const router = app._router || app.router;
  const stack = router && router.stack ? router.stack : [];
  const wrapped = wrapStack(stack);

  app.get("/api/debug/segunda-rodada-auto-vinculo", async function (req, res) {
    try {
      await ensureTables();

      const pontos = await getPool().query(`
        SELECT
          COUNT(*)::int AS usuarios,
          COALESCE(SUM(pontos_segunda_rodada), 0)::int AS pontos
        FROM solar_segunda_rodada_pontos
      `);

      const vinculos = await getPool().query(`
        SELECT COUNT(*)::int AS total
        FROM solar_2r_user_key_vinculos
      `);

      return res.json({
        ok: true,
        wrapped,
        modo: "auto-vinculo-geral",
        vinculos: Number(vinculos.rows[0].total || 0),
        pontos: pontos.rows[0]
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        wrapped,
        message: error.message || "Erro debug auto-vinculo."
      });
    }
  });

  console.log("[2R AUTO VINCULO] carregado. Rotas admin atualizadas:", wrapped);
})();
// SOLAR_2R_AUTO_VINCULO_GERAL_END



app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});










