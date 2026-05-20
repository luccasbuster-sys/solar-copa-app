const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const css = `
  <style id="hide-jogos-por-grupo">
    #jogos {
      display: none !important;
    }
  </style>
`;

if (!html.includes('id="hide-jogos-por-grupo"')) {
  html = html.replace("</head>", `${css}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Secao Jogos por Grupo escondida com seguranca.");