const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

// Garante credentials: "include" na chamada do ranking
html = html.replace(
  'const response = await fetch("/leaderboard");',
  `const response = await fetch("/leaderboard", {
      credentials: "include"
    });`
);

// Garante credentials: "include" no login/cadastro
html = html.replace(
  `const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      username,
      password
    })
  });`,
  `const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      username,
      password
    })
  });`
);

// Depois que login/cadastro for bem-sucedido, recarrega ranking
html = html.replace(
  `showToast(successMessage);`,
  `showToast(successMessage);

      if (typeof loadLeaderboard === "function") {
        loadLeaderboard();
      }`
);

// Quando checkLoggedUser confirmar sessão, também recarrega ranking
html = html.replace(
  `state.user = data.user;
      renderRegisteredState();`,
  `state.user = data.user;
      renderRegisteredState();

      if (typeof loadLeaderboard === "function") {
        loadLeaderboard();
      }`
);

fs.writeFileSync(path, html, "utf8");

console.log("Ranking corrigido para usar sessao do login.");