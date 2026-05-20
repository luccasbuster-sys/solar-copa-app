$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

# Remove card "Jogos na data selecionada"
$html = [regex]::Replace(
  $html,
  '<div class="summary-card">\s*<strong id="visibleMatchesCount">[\s\S]*?</div>',
  '',
  1
)

# Remove card antigo selectedDateLabel, caso ainda exista
$html = [regex]::Replace(
  $html,
  '<div class="summary-card">\s*<strong id="selectedDateLabel">[\s\S]*?</div>',
  '',
  1
)

# Troca texto antigo da seção
$html = $html -replace 'Escolha uma data, simule o resultado de cada partida e salve seus palpites no navegador\.', 'Escolha um grupo, simule os placares dos jogos e salve seus palpites no banco antes do início da partida.'

$html = $html -replace 'JOGOS DO DIA \+ SIMULADOR DE PLACAR', 'JOGOS POR GRUPO + SIMULADOR DE PLACAR'

# Corrige updateSummary para não depender mais do contador removido
$html = [regex]::Replace(
  $html,
  'function updateSummary\(\) \{[\s\S]*?\n    \}',
@'
function updateSummary() {
  $("#savedScoresCount").textContent = Object.keys(state.scores).length;
}
'@,
  1
)

# Garante que ao clicar nos grupos, os jogos sejam carregados
$html = [regex]::Replace(
  $html,
  'function renderDateChips\(\) \{[\s\S]*?\n\}',
@'
function renderDateChips() {
  const chips = $("#dateChips");
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  if (!state.selectedGroup) {
    state.selectedGroup = "A";
  }

  chips.innerHTML = groups.map(group => `
    <button class="chip ${group === state.selectedGroup ? "is-active" : ""}" type="button" data-group="${group}">
      Grupo ${group}
    </button>
  `).join("");

  chips.querySelectorAll(".chip").forEach(button => {
    button.addEventListener("click", async () => {
      state.selectedGroup = button.dataset.group;
      renderDateChips();
      await loadMatchesByGroup(state.selectedGroup);
    });
  });
}
'@,
  1
)

# Garante carregamento inicial do Grupo A
$html = $html -replace 'renderDateChips\(\);\s*renderMatches\(\);', 'renderDateChips(); loadMatchesByGroup(state.selectedGroup || "A");'

Set-Content $path $html -Encoding UTF8

Write-Host "Grupos corrigidos e bloco de data removido."