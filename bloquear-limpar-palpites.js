const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const css = `
  <style id="lock-clear-scores-button">
    body.round-locked #clearScoresBtn {
      display: none !important;
    }
  </style>
`;

if (!html.includes('id="lock-clear-scores-button"')) {
  html = html.replace("</head>", `${css}\n</head>`);
}

const lockJs = `
function getRoundStartDate() {
  /*
    Início da primeira rodada.
    Enquanto estivermos testando, pode alterar essa data.
    Quando chegar o dia real, o navegador vai comparar automaticamente.
  */
  return new Date("2026-06-11T19:00:00Z");
}

function isRoundLocked() {
  return new Date() >= getRoundStartDate();
}

function applyRoundLock() {
  const clearButton = $("#clearScoresBtn");

  if (isRoundLocked()) {
    document.body.classList.add("round-locked");

    if (clearButton) {
      clearButton.disabled = true;
      clearButton.textContent = "Palpites bloqueados";
      clearButton.title = "A rodada já começou. Não é possível limpar ou alterar palpites.";
    }
  } else {
    document.body.classList.remove("round-locked");
  }
}
`;

if (!html.includes("function getRoundStartDate()")) {
  html = html.replace("function setupReveal() {", `${lockJs}\n\n    function setupReveal() {`);
}

html = html.replace(
  "setupReveal();",
  "applyRoundLock();\n      setupReveal();"
);

fs.writeFileSync(path, html, "utf8");

console.log("Bloqueio do botao limpar palpites aplicado.");