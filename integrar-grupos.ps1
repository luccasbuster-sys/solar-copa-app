$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$newBlock = @'
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

  chips.querySelectorAll(".chip").forEach(button => {
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

    state.currentMatches = data.matches;
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
      <article class="match-card reveal is-visible" data-match="${match.id}" data-home="${match.home_team}" data-away="${match.away_team}">
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
  const filtered = state.currentMatches || [];
  const selectedGroup = state.selectedGroup || "A";

  $("#visibleMatchesCount").textContent = filtered.length;
  $("#savedScoresCount").textContent = Object.keys(state.scores).length;
  $("#selectedDateLabel").textContent = `Grupo ${selectedGroup}`;
}
'@

$html = [regex]::Replace(
  $html,
  'function renderDateChips\(\) \{[\s\S]*?\n    function updateSummary\(\) \{[\s\S]*?\n    \}',
  $newBlock,
  1
)

$html = $html -replace 'Jogos por data', 'Jogos por grupo'
$html = $html -replace 'datas', 'grupos'

Set-Content $path $html -Encoding UTF8

Write-Host "HTML integrado com jogos por grupo."