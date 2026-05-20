const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const css = `
  <style id="hide-hero-actions-when-logged">
    body.is-registered .hero-actions {
      display: none !important;
    }
  </style>
`;

if (!html.includes('id="hide-hero-actions-when-logged"')) {
  html = html.replace("</head>", `${css}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Botoes do hero ocultados apos login.");