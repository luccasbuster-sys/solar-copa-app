$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$newRenderMatches = @'
function renderMatches() {
  const grid = $("#matchesGrid");
  const filtered = matches.filter(match => match.date === state.selectedDate);

  grid.innerHTML = filtered.map(match => {
    const home = getTeam(match.home);
    const away = getTeam(match.away);
    const saved = state.scores[match.id] || {};

    return `
      <article class="match-card reveal is-visible" data-match="${match.id}" data-home="${home.name}" data-away="${away.name}">
        <div class="match-meta">
          <span class="tag">Grupo ${match.group}</span>
          <span class="tag">${match.fullDate} • ${match.time}</span>
        </div>

        <div class="versus">
          <div class="side">
            ${flagImage(home)}
            <strong>${home.name}</strong>
          </div>

          <div class="score-box" aria-label="Simular placar de ${home.name} contra ${away.name}">
            <input type="number" min="0" max="30" inputmode="numeric" value="${saved.home ?? ""}" placeholder="0" aria-label="Gols de ${home.name}" data-score="home" />
            <span>x</span>
            <input type="number" min="0" max="30" inputmode="numeric" value="${saved.away ?? ""}" placeholder="0" aria-label="Gols de ${away.name}" data-score="away" />
          </div>

          <div class="side">
            ${flagImage(away)}
            <strong>${away.name}</strong>
          </div>
        </div>

        <p>${match.venue}</p>

        <div class="match-actions">
          <span class="save-status">${saved.savedAt ? "Palpite salvo no banco" : "Ainda não salvo"}</span>
          <button class="mini-btn" type="button" data-save="${match.id}">Salvar placar</button>
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
        homeTeam: card.dataset.home,
        awayTeam: card.dataset.away,
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
'@

$html = [regex]::Replace(
  $html,
  'function renderMatches\(\) \{[\s\S]*?\n    function updateSummary\(\)',
  $newRenderMatches + "`n`n    function updateSummary()",
  1
)

Set-Content $path $html -Encoding UTF8

Write-Host "Salvamento de palpites integrado ao banco."