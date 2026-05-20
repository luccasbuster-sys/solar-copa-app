$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$dailyJs = @'
function dailyDates() {
  return [
    "2026-06-11",
    "2026-06-12",
    "2026-06-13",
    "2026-06-14",
    "2026-06-15",
    "2026-06-16",
    "2026-06-17",
    "2026-06-18",
    "2026-06-19",
    "2026-06-20",
    "2026-06-21",
    "2026-06-22",
    "2026-06-23",
    "2026-06-24",
    "2026-06-25",
    "2026-06-26",
    "2026-06-27",
    "2026-06-28"
  ];
}

function formatDayLabel(dateText) {
  const date = new Date(`${dateText}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return dateText;
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
}

function renderDayChips() {
  const chips = $("#dayChips");

  if (!chips) return;

  if (!state.selectedDay) {
    state.selectedDay = "2026-06-13";
  }

  chips.innerHTML = dailyDates().map(date => `
    <button class="chip ${date === state.selectedDay ? "is-active" : ""}" type="button" data-day="${date}">
      ${formatDayLabel(date)}
    </button>
  `).join("");

  chips.querySelectorAll("[data-day]").forEach(button => {
    button.addEventListener("click", async () => {
      state.selectedDay = button.dataset.day;
      renderDayChips();
      await loadMatchesByDay(state.selectedDay);
    });
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
  $("#selectedDayLabel").textContent = formatDayLabel(state.selectedDay || "2026-06-13");

  if (!filtered.length) {
    grid.innerHTML = `
      <article class="match-card reveal is-visible">
        <p>Nenhum jogo encontrado para esta data.</p>
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

$html = $html -replace 'function setupReveal\(\) \{', "$dailyJs`n`n    function setupReveal() {"

$html = $html -replace 'renderDateChips\(\); loadMatchesByGroup\(state\.selectedGroup \|\| "A"\);', 'renderDateChips(); loadMatchesByGroup(state.selectedGroup || "A"); renderDayChips(); loadMatchesByDay(state.selectedDay || "2026-06-13");'

Set-Content $path $html -Encoding UTF8

Write-Host "JavaScript dos Jogos do Dia adicionado."