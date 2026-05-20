const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const gruposMatch = html.match(
  /<section class="section reveal" id="grupos">[\s\S]*?<\/section>/
);

const jogosDiaMatch = html.match(
  /<section class="section reveal" id="jogosDoDia">[\s\S]*?<\/section>/
);

if (!gruposMatch) {
  console.error("Não encontrei a seção id='grupos'.");
  process.exit(1);
}

if (!jogosDiaMatch) {
  console.error("Não encontrei a seção id='jogosDoDia'.");
  process.exit(1);
}

const gruposSection = gruposMatch[0];
const jogosDiaSection = jogosDiaMatch[0];

const gruposIndex = html.indexOf(gruposSection);
const jogosDiaIndex = html.indexOf(jogosDiaSection);

if (jogosDiaIndex < gruposIndex) {
  console.log("As seções já estão na ordem correta: Jogos do Dia antes dos Grupos.");
  process.exit(0);
}

html = html.replace(gruposSection, "__GRUPOS_SECTION__");
html = html.replace(jogosDiaSection, "__JOGOS_DIA_SECTION__");

html = html.replace("__GRUPOS_SECTION__", jogosDiaSection);
html = html.replace("__JOGOS_DIA_SECTION__", gruposSection);

fs.writeFileSync(path, html, "utf8");

console.log("Posição das seções trocada: Jogos do Dia agora vem antes dos Grupos.");