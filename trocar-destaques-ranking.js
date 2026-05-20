const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const rankingSection = `
      <section class="section reveal" id="classificacao">
        <div class="section-head">
          <div>
            <span class="section-kicker">Ranking</span>
            <h2>Classificação dos Usuários</h2>
            <p>
              A classificação mostra os usuários com mais pontos. Por enquanto, cada palpite salvo vale 1 ponto provisório.
            </p>
          </div>

          <button class="btn btn-primary" id="refreshLeaderboardBtn" type="button">
            Atualizar classificação
          </button>
        </div>

        <div class="matches-grid" id="leaderboardGrid">
          <article class="match-card reveal is-visible">
            <p>Carregando classificação...</p>
          </article>
        </div>
      </section>
`;

html = html.replace(
  /<section class="section reveal" id="destaques">[\s\S]*?<\/section>/,
  rankingSection
);

const leaderboardJs = `
async function loadLeaderboard() {
  const grid = $("#leaderboardGrid");

  if (!grid) return;

  try {
    grid.innerHTML = \`
      <article class="match-card reveal is-visible">
        <p>Carregando classificação...</p>
      </article>
    \`;

    const response = await fetch("/leaderboard");
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Erro ao carregar classificação.");
    }

    if (!data.leaderboard.length) {
      grid.innerHTML = \`
        <article class="match-card reveal is-visible">
          <p>Ainda não há usuários classificados.</p>
        </article>
      \`;
      return;
    }

    grid.innerHTML = data.leaderboard.map(user => \`
      <article class="match-card reveal is-visible">
        <div class="match-meta">
          <span class="tag">#\${user.position}</span>
          <span class="tag">\${user.points} ponto(s)</span>
        </div>

        <h3 style="font-size: clamp(28px, 4vw, 44px); line-height: .9; letter-spacing: -.04em; text-transform: uppercase;">
          \${user.username}
        </h3>

        <p>
          \${user.predictionsCount} palpite(s) salvo(s)
        </p>
      </article>
    \`).join("");
  } catch (error) {
    grid.innerHTML = \`
      <article class="match-card reveal is-visible">
        <p>\${error.message || "Não foi possível carregar a classificação."}</p>
      </article>
    \`;
  }
}

function setupLeaderboard() {
  const button = $("#refreshLeaderboardBtn");

  if (button) {
    button.addEventListener("click", loadLeaderboard);
  }

  loadLeaderboard();
}
`;

if (!html.includes("function loadLeaderboard()")) {
  html = html.replace("function setupReveal() {", `${leaderboardJs}\n\n    function setupReveal() {`);
}

html = html.replace(
  "renderHighlights();",
  "setupLeaderboard();"
);

fs.writeFileSync(path, html, "utf8");

console.log("Secao Destaques trocada por Classificacao.");