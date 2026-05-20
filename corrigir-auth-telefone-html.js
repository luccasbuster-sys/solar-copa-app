const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const newAuthBlock = `
function renderRegisteredState() {
  const resetBtn = $("#resetUserBtn");
  const heroTitle = document.querySelector(".hero h1");

  if (state.user) {
    document.body.classList.add("is-registered");
    resetBtn.hidden = false;

    const displayName = state.user.firstName
      ? state.user.firstName
      : state.user.username || "usuário";

    if (heroTitle) {
      heroTitle.innerHTML = \`SEJA BEM-VINDO À <span class="gradient-text">PRIMEIRA RODADA</span>\`;
    }

    $("#heroLead").textContent = \`Olá, \${displayName}! Seja bem-vindo à primeira rodada. Escolha seu grupo, veja os jogos do dia e salve seus palpites antes do início das partidas.\`;
  } else {
    document.body.classList.remove("is-registered");
    resetBtn.hidden = true;

    if (heroTitle) {
      heroTitle.innerHTML = \`SEJA BEM-VINDO À <span class="gradient-text">PRIMEIRA RODADA</span>\`;
    }

    $("#heroLead").textContent = "Entre com seu telefone e senha para acessar a primeira rodada, escolher seu grupo e salvar seus palpites.";
  }
}

async function requestAuth(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(payload)
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Não foi possível concluir a operação.");
  }

  return data;
}

async function checkLoggedUser() {
  try {
    const response = await fetch("/me", {
      credentials: "include"
    });

    const data = await response.json();

    if (response.ok && data.success && data.user) {
      state.user = data.user;
      renderRegisteredState();

      if (typeof loadLeaderboard === "function") {
        loadLeaderboard();
      }
    }
  } catch (error) {
    console.warn("Sessão ainda não iniciada.");
  }
}

function onlyPhoneDigits(value) {
  return String(value || "").replace(/\\D/g, "");
}

function setupRegistration() {
  const form = $("#registrationForm");
  const loginButton = $("#loginButton");
  const phoneInput = $("#phoneInput");

  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      const digits = onlyPhoneDigits(phoneInput.value).slice(0, 11);

      if (digits.length <= 10) {
        phoneInput.value = digits.replace(/(\\d{2})(\\d{4})(\\d{0,4})/, (_, ddd, part1, part2) => {
          return part2 ? \`(\${ddd}) \${part1}-\${part2}\` : \`(\${ddd}) \${part1}\`;
        });
      } else {
        phoneInput.value = digits.replace(/(\\d{2})(\\d{5})(\\d{0,4})/, (_, ddd, part1, part2) => {
          return part2 ? \`(\${ddd}) \${part1}-\${part2}\` : \`(\${ddd}) \${part1}\`;
        });
      }
    });
  }

  async function handleAuth(mode) {
    const firstName = $("#firstNameInput") ? $("#firstNameInput").value.trim() : "";
    const lastName = $("#lastNameInput") ? $("#lastNameInput").value.trim() : "";
    const phone = onlyPhoneDigits($("#phoneInput").value);
    const password = $("#passwordInput").value;
    const error = $("#formError");

    error.textContent = "";

    if (mode === "register") {
      if (firstName.length < 2) {
        error.textContent = "Informe seu nome.";
        return;
      }

      if (lastName.length < 2) {
        error.textContent = "Informe seu sobrenome.";
        return;
      }
    }

    if (phone.length < 10 || phone.length > 11) {
      error.textContent = "Informe um telefone válido com DDD.";
      return;
    }

    if (password.length < 6) {
      error.textContent = "A senha precisa ter pelo menos 6 caracteres.";
      return;
    }

    const endpoint = mode === "login" ? "/login" : "/register";
    const loadingMessage = mode === "login" ? "Entrando..." : "Criando cadastro...";
    const successMessage = mode === "login" ? "Login realizado com sucesso!" : "Cadastro criado com sucesso!";

    const payload = mode === "login"
      ? {
          phone,
          password
        }
      : {
          firstName,
          lastName,
          phone,
          password
        };

    try {
      error.textContent = loadingMessage;

      const data = await requestAuth(endpoint, payload);

      state.user = data.user;

      error.textContent = "";
      renderRegisteredState();
      showToast(successMessage);

      if (typeof loadLeaderboard === "function") {
        loadLeaderboard();
      }

      setTimeout(() => {
        const target = $("#jogosDoDia") || $("#grupos") || document.body;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
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
        method: "POST",
        credentials: "include"
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
`;

html = html.replace(
  /function renderRegisteredState\(\) \{[\s\S]*?function setupRegistration\(\) \{[\s\S]*?\n\}/,
  newAuthBlock
);

fs.writeFileSync(path, html, "utf8");

console.log("Cadastro e login por telefone corrigidos no HTML.");