const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

// Cria backup automático antes de remover
fs.writeFileSync("public/index-antes-remover-jogos-grupo.html", html, "utf8");

// Remove a seção inteira de jogos por grupo
html = html.replace(
  /<section class="section reveal" id="jogos">[\s\S]*?<\/section>/,
  ""
);

// Remove chamada inicial dessa seção, se existir
html = html.replace(
  /renderDateChips\(\);\s*loadMatchesByGroup\(state\.selectedGroup \|\| "A"\);\s*/g,
  ""
);

// Remove chamadas soltas antigas, se existirem
html = html.replace(/renderDateChips\(\);\s*/g, "");
html = html.replace(/loadMatchesByGroup\(state\.selectedGroup \|\| "A"\);\s*/g, "");

// Ajusta links que apontavam para #jogos para apontar para Jogos do Dia
html = html.replace(/href="#jogos"/g, 'href="#jogosDoDia"');

// Mantém funções antigas no JS sem remover, para evitar quebrar dependências.
// Elas não aparecem mais porque a seção foi removida.

fs.writeFileSync(path, html, "utf8");

console.log("Secao Jogos por Grupo removida com sucesso.");