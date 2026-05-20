const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

html = html.replace(
  /<h2>Carrossel Especial<\/h2>/g,
  "<h2>Premiação Especial</h2>"
);

fs.writeFileSync(path, html, "utf8");

console.log("Titulo do carrossel alterado para Premiação Especial.");