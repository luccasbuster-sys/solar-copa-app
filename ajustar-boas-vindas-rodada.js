const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const newRenderRegisteredState = `
function getCurrentRoundName() {
  /*
    Hoje estamos trabalhando com a primeira fase.
    Quando precisar, podemos evoluir esta função para detectar:
    Primeira rodada
    Segunda rodada
    Terceira rodada
    Oitavas
    Quartas
    Semifinal
    Final
  */
  return "PRIMEIRA RODADA";
}

function renderRegisteredState() {
  const resetBtn = $("#resetUserBtn");
  const heroTitle = document.querySelector(".hero h1");

  if (state.user) {
    document.body.classList.add("is-registered");
    resetBtn.hidden = false;

    const roundName = getCurrentRoundName();

    if (heroTitle) {
      heroTitle.innerHTML = \`SEJA BEM-VINDO À <span class="gradient-text">\${roundName}</span>\`;
    }

    $("#heroLead").textContent = \`Olá, \${state.user.username || "usuário"}! Esta saudação corresponde à \${roundName.toLowerCase()}. Escolha seu grupo, veja os jogos do dia e salve seus palpites antes do início das partidas.\`;
  } else {
    document.body.classList.remove("is-registered");
    resetBtn.hidden = true;

    if (heroTitle) {
      heroTitle.innerHTML = \`CADASTRE-SE, VEJA OS GRUPOS E SIMULE OS PLACARES DA <span class="gradient-text">PRIMEIRA RODADA.</span>\`;
    }

    $("#heroLead").textContent = "Crie seu cadastro ou entre com usuário e senha para liberar a experiência interativa da Copa Solar.";
  }
}
`;

html = html.replace(
  /function renderRegisteredState\(\) \{[\s\S]*?\n\}\n\nasync function requestAuth/,
  `${newRenderRegisteredState}\n\nasync function requestAuth`
);

fs.writeFileSync(path, html, "utf8");

console.log("Boas-vindas por rodada ajustadas.");