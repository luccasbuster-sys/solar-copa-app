const fs = require("fs");

const path = "public/index.html";

let html = fs.readFileSync(path, "utf8");

const replacements = [
  ["\\u00C3\\u00A1", "á"],
  ["\\u00C3\\u00A0", "à"],
  ["\\u00C3\\u00A2", "â"],
  ["\\u00C3\\u00A3", "ã"],
  ["\\u00C3\\u00A9", "é"],
  ["\\u00C3\\u00AA", "ê"],
  ["\\u00C3\\u00AD", "í"],
  ["\\u00C3\\u00B3", "ó"],
  ["\\u00C3\\u00B4", "ô"],
  ["\\u00C3\\u00B5", "õ"],
  ["\\u00C3\\u00BA", "ú"],
  ["\\u00C3\\u00BC", "ü"],
  ["\\u00C3\\u00A7", "ç"],

  ["\\u00C3\\u0081", "Á"],
  ["\\u00C3\\u0080", "À"],
  ["\\u00C3\\u0082", "Â"],
  ["\\u00C3\\u0083", "Ã"],
  ["\\u00C3\\u0089", "É"],
  ["\\u00C3\\u008A", "Ê"],
  ["\\u00C3\\u008D", "Í"],
  ["\\u00C3\\u0093", "Ó"],
  ["\\u00C3\\u0094", "Ô"],
  ["\\u00C3\\u0095", "Õ"],
  ["\\u00C3\\u009A", "Ú"],
  ["\\u00C3\\u0087", "Ç"],

  ["\\u00E2\\u20AC\\u201D", "-"],
  ["\\u00E2\\u20AC\\u201C", "-"],
  ["\\u00E2\\u20AC\\u00A2", "•"],
  ["\\u00E2\\u20AC\\u00A6", "..."],
  ["\\u00E2\\u20AC\\u02DC", "'"],
  ["\\u00E2\\u20AC\\u2122", "'"],
  ["\\u00E2\\u20AC\\u0153", "\""],
  ["\\u00E2\\u20AC\\u009D", "\""],
  ["\\u00C2\\u00A0", " "],
  ["\\u00C2\\u00BA", "º"],
  ["\\u00C2\\u00AA", "ª"]
];

for (const [brokenEscaped, fixed] of replacements) {
  const broken = brokenEscaped.replace(/\\u([0-9A-Fa-f]{4})/g, (_, code) =>
    String.fromCharCode(parseInt(code, 16))
  );

  html = html.split(broken).join(fixed);
}

// Corrige especificamente o conteúdo quebrado da data de hoje.
html = html.replace(
  /<strong id="selectedDayLabel">[\s\S]*?<\/strong>/,
  '<strong id="selectedDayLabel">-</strong>'
);

// Garante charset correto.
if (!html.includes('<meta charset="UTF-8"')) {
  html = html.replace("<head>", '<head>\n  <meta charset="UTF-8" />');
}

// Fonte segura para acentuação.
const css = `
  <style id="encoding-font-fix">
    body,
    button,
    input,
    select,
    textarea,
    p,
    span,
    strong,
    a,
    label {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif !important;
      text-rendering: geometricPrecision;
    }
  </style>
`;

if (!html.includes('id="encoding-font-fix"')) {
  html = html.replace("</head>", `${css}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Acentuacao e simbolos corrigidos.");