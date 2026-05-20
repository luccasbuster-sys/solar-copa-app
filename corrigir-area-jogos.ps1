$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$newGamesBlock = @'
function renderDateChips() {
  const chips = $("#dateChips");
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  if (!state.selectedGroup) {
    state.selectedGroup = "A";
  }

  chips.innerHTML = groups.map(group => `
    <button class="chip ${group === state.selectedGroup ? "is-active" : ""}" type="button" data-group="${group}">
      Grupo ${group}
    </button>
  `).join("");

  chips.querySelectorAll("[data-group]").forEach(button => {
    button.addEventListener("click", async () => {
      state.selectedGroup = button.dataset.group;
      renderDateChips();
      await loadMatchesByGroup(state.selectedGroup);
    });
  });
}

function formatKickoff(kickoffAt) {
  const date = new Date(kickoffAt);

  if (Number.isNaN(date.getTime())) {
    return "Data e horário indisponíveis";
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function isMatchLocked(kickoffAt) {
  const date = new Date(kickoffAt);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return new Date() >= date;
}

async function loadMatchesByGroup(group) {
  const grid = $("#matchesGrid");

  if (!grid) return;

  try {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>Carregando jogos do Grupo ${group}...</p>
      </article>
    `;

    const response = await fetch(`/matches/${group}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Erro ao carregar jogos do grupo.");
    }

    state.currentMatches = data.matches || [];
    renderMatches();
  } catch (error) {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>${error.message || "Não foi possível carregar os jogos."}</p>
      </article>
    `;
  }
}

function renderMatches() {
  const grid = $("#matchesGrid");
  const filtered = state.currentMatches || [];

  if (!grid) return;

  if (!filtered.length) {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>Nenhum jogo encontrado para este grupo.</p>
      </article>
    `;
    updateSummary();
    return;
  }

  grid.innerHTML = filtered.map(match => {
    const saved = state.scores[match.id] || {};
    const locked = isMatchLocked(match.kickoff_at);
    const kickoffLabel = formatKickoff(match.kickoff_at);

    return `
      <article class="match-card reveal is-visible" data-match="${match.id}">
        <div class="match-meta">
          <span class="tag">Grupo ${match.group_name}</span>
          <span class="tag">${kickoffLabel}</span>
        </div>

        <div class="versus">
          <div class="side">
            <strong>${match.home_team}</strong>
          </div>

          <div class="score-box" aria-label="Palpite de ${match.home_team} contra ${match.away_team}">
            <input type="number" min="0" max="30" inputmode="numeric" value="${saved.home ?? ""}" placeholder="0" aria-label="Gols de ${match.home_team}" data-score="home" ${locked ? "disabled" : ""} />
            <span>x</span>
            <input type="number" min="0" max="30" inputmode="numeric" value="${saved.away ?? ""}" placeholder="0" aria-label="Gols de ${match.away_team}" data-score="away" ${locked ? "disabled" : ""} />
          </div>

          <div class="side">
            <strong>${match.away_team}</strong>
          </div>
        </div>

        <p>${match.venue || "Estádio a confirmar"}</p>

        <div class="match-actions">
          <span class="save-status">${locked ? "Palpite encerrado: jogo iniciado" : saved.savedAt ? "Palpite salvo no banco" : "Ainda não salvo"}</span>
          <button class="mini-btn" type="button" data-save="${match.id}" ${locked ? "disabled" : ""}>
            ${locked ? "Prazo encerrado" : "Salvar placar"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-save]").forEach(button => {
    button.addEventListener("click", async () => {
      const matchId = button.dataset.save;
      const card = grid.querySelector(`[data-match="${matchId}"]`);
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

        status.textContent = "Palpite salvo no banco";
        showToast("Palpite salvo no banco com sucesso!");
      } catch (error) {
        status.textContent = "Erro ao salvar";
        showToast(error.message || "Erro ao salvar palpite.");
      } finally {
        button.disabled = false;
      }
    });
  });

  updateSummary();
}

function updateSummary() {
  const savedCounter = $("#savedScoresCount");

  if (savedCounter) {
    savedCounter.textContent = Object.keys(state.scores).length;
  }
}
'@

# Remove card "Jogos na data selecionada"
$html = [regex]::Replace(
  $html,
  '<div class="summary-card">\s*<strong id="visibleMatchesCount">[\s\S]*?</div>',
  '',
  1
)

# Remove card selectedDateLabel, se ainda existir
$html = [regex]::Replace(
  $html,
  '<div class="summary-card">\s*<strong id="selectedDateLabel">[\s\S]*?</div>',
  '',
  1
)

# Substitui todo o bloco antigo de renderDateChips/renderMatches/updateSummary até antes de setupScoreActions
$html = [regex]::Replace(
  $html,
  'function renderDateChips\(\) \{[\s\S]*?function setupScoreActions\(\)',
  $newGamesBlock + "`n`n    function setupScoreActions()",
  1
)

# Corrige carregamento inicial
$html = [regex]::Replace(
  $html,
  'renderDateChips\(\);\s*(renderMatches\(\);|loadMatchesByGroup\(state\.selectedGroup \|\| "A"\);)',
  'renderDateChips(); loadMatchesByGroup(state.selectedGroup || "A");',
  1
)

# Textos antigos
$html = $html -replace 'JOGOS DO DIA \+ SIMULADOR DE PLACAR', 'JOGOS POR GRUPO + SIMULADOR DE PLACAR'
$html = $html -replace 'Escolha uma data, simule o resultado de cada partida e salve seus palpites no navegador\.', 'Escolha um grupo, simule os placares dos jogos e salve seus palpites no banco antes do início da partida.'

Set-Content $path $html -Encoding UTF8

Write-Host "Area de jogos corrigida definitivamente."