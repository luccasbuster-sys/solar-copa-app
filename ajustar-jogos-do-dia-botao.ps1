$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

# Troca a seção com várias datas por uma seção com botão único
$newDailySection = @'
      <section class="section reveal" id="jogosDoDia">
        <div class="section-head">
          <div>
            <span class="section-kicker">Agenda de hoje</span>
            <h2>Jogos do Dia</h2>
            <p>
              Clique para carregar automaticamente os jogos correspondentes ao dia atual. Os palpites só podem ser salvos antes do início da partida.
            </p>
          </div>

          <button class="btn btn-primary" id="loadTodayMatchesBtn" type="button">
            Ver jogos do dia
          </button>
        </div>

        <div class="summary-panel reveal">
          <div class="summary-card">
            <strong id="dailyMatchesCount">0</strong>
            <span>jogos de hoje</span>
          </div>

          <div class="summary-card">
            <strong id="selectedDayLabel">—</strong>
            <span>data de hoje</span>
          </div>
        </div>

        <div class="matches-grid" id="dailyMatchesGrid"></div>
      </section>

'@

$html = [regex]::Replace(
  $html,
  '<section class="section reveal" id="jogosDoDia">[\s\S]*?</section>',
  $newDailySection,
  1
)

# Remove funções antigas de lista de datas e substitui por botão "Jogos do Dia"
$newDailyJs = @'
function getTodayMatchDate() {
  /*
    MODO TESTE:
    Enquanto estamos testando, usamos 2026-06-11 como se fosse "hoje".

    Quando quiser usar a data real do computador, troque:
    const testDate = "2026-06-11";

    por:
    const testDate = null;
  */
  const testDate = "2026-06-11";

  if (testDate) {
    return testDate;
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDayLabel(dateText) {
  const date = new Date(`${dateText}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function setupTodayMatchesButton() {
  const button = $("#loadTodayMatchesBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const todayDate = getTodayMatchDate();
    state.selectedDay = todayDate;
    await loadMatchesByDay(todayDate);
    $("#jogosDoDia").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadMatchesByDay(date) {
  const grid = $("#dailyMatchesGrid");

  if (!grid) return;

  try {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>Carregando jogos do dia ${formatDayLabel(date)}...</p>
      </article>
    `;

    const response = await fetch(`/matches/day/${date}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Erro ao carregar jogos do dia.");
    }

    state.dailyMatches = data.matches || [];
    renderDailyMatches();
  } catch (error) {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>${error.message || "Não foi possível carregar os jogos do dia."}</p>
      </article>
    `;
  }
}

function renderDailyMatches() {
  const grid = $("#dailyMatchesGrid");
  const filtered = state.dailyMatches || [];

  if (!grid) return;

  $("#dailyMatchesCount").textContent = filtered.length;
  $("#selectedDayLabel").textContent = formatDayLabel(state.selectedDay || getTodayMatchDate());

  if (!filtered.length) {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>Nenhum jogo encontrado para hoje.</p>
      </article>
    `;
    return;
  }

  grid.innerHTML = filtered.map(match => {
    const saved = state.scores[match.id] || {};
    const locked = isMatchLocked(match.kickoff_at);
    const kickoffLabel = formatKickoff(match.kickoff_at);

    return `
      <article class="match-card reveal is-visible" data-daily-match="${match.id}">
        <div class="match-meta">
          <span class="tag">Grupo ${match.group_name}</span>
          <span class="tag">${kickoffLabel}</span>
        </div>

        <div class="versus">
          <div class="side">
            ${teamBlock(match.home_team)}
          </div>

          <div class="score-box" aria-label="Palpite de ${teamDisplayName(match.home_team)} contra ${teamDisplayName(match.away_team)}">
            <input type="number" min="0" max="30" inputmode="numeric" value="${saved.home ?? ""}" placeholder="0" aria-label="Gols de ${teamDisplayName(match.home_team)}" data-score="home" ${locked ? "disabled" : ""} />
            <span>x</span>
            <input type="number" min="0" max="30" inputmode="numeric" value="${saved.away ?? ""}" placeholder="0" aria-label="Gols de ${teamDisplayName(match.away_team)}" data-score="away" ${locked ? "disabled" : ""} />
          </div>

          <div class="side">
            ${teamBlock(match.away_team)}
          </div>
        </div>

        <p>${match.venue || "Estádio a confirmar"}</p>

        <div class="match-actions">
          <span class="save-status">${locked ? "Palpite encerrado: jogo iniciado" : saved.savedAt ? "Palpite salvo no banco" : "Ainda não salvo"}</span>
          <button class="mini-btn" type="button" data-save-daily="${match.id}" ${locked ? "disabled" : ""}>
            ${locked ? "Prazo encerrado" : "Salvar placar"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-save-daily]").forEach(button => {
    button.addEventListener("click", async () => {
      const matchId = button.dataset.saveDaily;
      const card = grid.querySelector(`[data-daily-match="${matchId}"]`);
      const homeInput = card.querySelector('[data-score="home"]');
      const awayInput = card.querySelector('[data-score="away"]');
      const status = card.querySelector(".save-status");

      const homeScore = homeInput.value;
      const awayScore = awayInput.value;

      if (homeScore === "" || awayScore === "") {
        showToast("Preencha os dois placares antes de salvar.");
        return;
      }

      const payload = new URLSearchParams({
        matchId,
        homeScore: String(Math.max(0, Number(homeScore))),
        awayScore: String(Math.max(0, Number(awayScore)))
      });

      try {
        button.disabled = true;
        status.textContent = "Salvando no banco...";

        const response = await fetch("/predictions", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: payload
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Erro ao salvar palpite.");
        }

        state.scores[matchId] = {
          home: Math.max(0, Number(homeScore)),
          away: Math.max(0, Number(awayScore)),
          savedAt: new Date().toISOString()
        };

        saveScores();
        updateSummary();
        renderDailyMatches();

        showToast("Palpite salvo no banco com sucesso!");
      } catch (error) {
        status.textContent = "Erro ao salvar";
        showToast(error.message || "Erro ao salvar palpite.");
      } finally {
        button.disabled = false;
      }
    });
  });
}
'@

# Substitui o bloco JS antigo dos jogos do dia
$html = [regex]::Replace(
  $html,
  'function dailyDates\(\) \{[\s\S]*?function renderDailyMatches\(\) \{[\s\S]*?\n\}',
  $newDailyJs,
  1
)

# Remove inicialização antiga de múltiplas datas
$html = $html -replace 'renderDayChips\(\);\s*loadMatchesByDay\(state\.selectedDay \|\| "2026-06-13"\);', 'setupTodayMatchesButton();'

# Caso a inicialização não tenha sido substituída, adiciona no init
if ($html -notmatch 'setupTodayMatchesButton\(\);') {
  $html = $html -replace 'renderDateChips\(\); loadMatchesByGroup\(state\.selectedGroup \|\| "A"\);', 'renderDateChips(); loadMatchesByGroup(state.selectedGroup || "A"); setupTodayMatchesButton();'
}

Set-Content $path $html -Encoding UTF8

Write-Host "Jogos do Dia ajustado para botao unico."