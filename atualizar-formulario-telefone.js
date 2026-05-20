const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const newForm = `
<form class="form-grid" id="registrationForm">
  <label>
    Nome
    <input
      id="firstNameInput"
      name="firstName"
      type="text"
      autocomplete="given-name"
      placeholder="Ex: Ana"
      minlength="2"
      required
    />
  </label>

  <label>
    Sobrenome
    <input
      id="lastNameInput"
      name="lastName"
      type="text"
      autocomplete="family-name"
      placeholder="Ex: Silva"
      minlength="2"
      required
    />
  </label>

  <label>
    Telefone
    <input
      id="phoneInput"
      name="phone"
      type="tel"
      autocomplete="tel"
      placeholder="(00) 00000-0000"
      minlength="10"
      required
    />
  </label>

  <label>
    Senha
    <input
      id="passwordInput"
      name="password"
      type="password"
      autocomplete="current-password"
      placeholder="Digite sua senha"
      minlength="6"
      required
    />
  </label>

  <p class="form-hint">
    Use seu telefone e senha para entrar novamente. O telefone evita cadastros duplicados.
  </p>

  <p class="form-error" id="formError" aria-live="polite"></p>

  <button class="btn btn-primary" type="submit">Criar cadastro</button>
  <button class="btn" type="button" id="loginButton">Entrar com minha conta</button>
</form>
`;

html = html.replace(
  /<form class="form-grid" id="registrationForm">[\s\S]*?<\/form>/,
  newForm.trim()
);

html = html.replace(
  /Crie seu cadastro com nome de usuário e senha\. Seus dados serão salvos com segurança no banco do servidor\./g,
  "Preencha seu nome, sobrenome, telefone e senha para acessar a área da Copa Solar."
);

html = html.replace(
  /Entre com seu usuário e senha para acessar a primeira rodada, escolher seu grupo e salvar seus palpites\./g,
  "Entre com seu telefone e senha para acessar a primeira rodada, escolher seu grupo e salvar seus palpites."
);

fs.writeFileSync(path, html, "utf8");

console.log("Formulario atualizado para nome, sobrenome, telefone e senha.");