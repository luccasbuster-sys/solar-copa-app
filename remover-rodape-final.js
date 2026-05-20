const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const css = `
  <style id="hide-footer-final">
    .footer {
      display: none !important;
    }
  </style>
`;

if (!html.includes('id="hide-footer-final"')) {
  html = html.replace("</head>", `${css}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Barra final do site removida.");