const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const newHeroTitle = `
            SEJA BEM-VINDO À
            <span class="gradient-text">PRIMEIRA RODADA</span>
`;

html = html.replace(
  /Cadastre-se, veja os grupos e simule os placares da\s*<span class="gradient-text">[\s\S]*?<\/span>/,
  newHeroTitle.trim()
);

html = html.replace(
  /\$\(\"\#heroLead\"\)\.textContent = `Olá, \$\{username\}! Login ativo\. Agora você pode navegar pelos grupos e salvar seus placares da primeira rodada\.`;/,
  '$("#heroLead").textContent = `Olá, ${username}! Seja bem-vindo à primeira rodada. Escolha seu grupo, veja os jogos do dia e salve seus palpites antes do início das partidas.`;'
);

html = html.replace(
  /\$\(\"\#heroLead\"\)\.textContent = "Crie seu cadastro ou entre com usuário e senha para liberar a experiência interativa da Copa Solar\.";/,
  '$("#heroLead").textContent = "Entre com seu usuário e senha para acessar a primeira rodada, escolher seu grupo e salvar seus palpites.";'
);

fs.writeFileSync(path, html, "utf8");

console.log("Hero e saudacao da rodada corrigidos.");