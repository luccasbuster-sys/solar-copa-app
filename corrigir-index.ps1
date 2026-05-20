$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$newForm = @'
<form class="form-grid" id="registrationForm">
  <label>
    Nome de usuário
    <input
      id="usernameInput"
      name="username"
      type="text"
      autocomplete="username"
      placeholder="Ex: ana2026"
      minlength="3"
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
    Crie seu cadastro ou entre com usuário e senha para acessar a área da Copa Solar.
  </p>

  <p class="form-error" id="formError" aria-live="polite"></p>

  <button class="btn btn-primary" type="submit">Criar cadastro</button>
  <button class="btn" type="button" id="loginButton">Entrar com minha conta</button>
</form>
'@

$newScript = @'
function renderRegisteredState() {
  const resetBtn = $("#resetUserBtn");

  if (state.user) {
    document.body.classList.add("is-registered");
    resetBtn.hidden = false;

    const username = state.user.username || "usuário";

    $("#heroLead").textContent = `Olá, ${username}! Login ativo. Agora você pode navegar pelos grupos e salvar seus placares da primeira rodada.`;
  } else {
    document.body.classList.remove("is-registered");
    resetBtn.hidden = true;
    $("#heroLead").textContent = "Crie seu cadastro ou entre com usuário e senha para liberar a experiência interativa da Copa Solar.";
  }
}

async function requestAuth(endpoint, username, password) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      username,
      password
    })
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Não foi possível concluir a operação.");
  }

  return data;
}

async function checkLoggedUser() {
  try {
    const response = await fetch("/me");
    const data = await response.json();

    if (response.ok && data.success && data.user) {
      state.user = data.user;
      renderRegisteredState();
    }
  } catch (error) {
    console.warn("Sessão ainda não iniciada.");
  }
}

function setupRegistration() {
  const form = $("#registrationForm");
  const loginButton = $("#loginButton");

  async function handleAuth(mode) {
    const username = $("#usernameInput").value.trim();
    const password = $("#passwordInput").value;
    const error = $("#formError");

    error.textContent = "";

    if (username.length < 3) {
      error.textContent = "O usuário precisa ter pelo menos 3 caracteres.";
      return;
    }

    if (password.length < 6) {
      error.textContent = "A senha precisa ter pelo menos 6 caracteres.";
      return;
    }

    const endpoint = mode === "login" ? "/login" : "/register";
    const loadingMessage = mode === "login" ? "Entrando..." : "Criando cadastro...";
    const successMessage = mode === "login" ? "Login realizado com sucesso!" : "Cadastro criado com sucesso!";

    try {
      error.textContent = loadingMessage;

      const data = await requestAuth(endpoint, username, password);

      state.user = data.user;

      error.textContent = "";
      renderRegisteredState();
      showToast(successMessage);

      setTimeout(() => {
        $("#grupos").scrollIntoView({ behavior: "smooth", block: "start" });
      }, 160);
    } catch (authError) {
      error.textContent = authError.message;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAuth("register");
  });

  loginButton.addEventListener("click", () => {
    handleAuth("login");
  });

  $("#resetUserBtn").addEventListener("click", async () => {
    try {
      await fetch("/logout", {
        method: "POST"
      });
    } catch (error) {
      console.warn("Não foi possível encerrar a sessão no servidor.");
    }

    localStorage.removeItem(storageKeys.user);
    state.user = null;
    renderRegisteredState();
    showToast("Você saiu da conta.");

    setTimeout(() => {
      $("#cadastro").scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  });

  checkLoggedUser();
}
'@

$html = [regex]::Replace(
  $html,
  '<form class="form-grid" id="registrationForm">[\s\S]*?</form>',
  $newForm,
  1
)

$html = [regex]::Replace(
  $html,
  'function renderRegisteredState\(\) \{[\s\S]*?function setupRegistration\(\) \{[\s\S]*?\n    \}',
  $newScript,
  1
)

$html = $html -replace 'Preencha seus dados para acessar a área da Copa Solar\. Os dados ficam salvos apenas neste navegador\.', 'Crie seu cadastro com nome de usuário e senha. Seus dados serão salvos com segurança no banco do servidor.'

Set-Content $path $html -Encoding UTF8

Write-Host "index.html corrigido com cadastro e login reais."