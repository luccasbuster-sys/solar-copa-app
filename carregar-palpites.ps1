$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$helperFunctions = @'
async function loadPredictionsFromServer() {
  try {
    const response = await fetch("/predictions");
    const data = await response.json();

    if (!response.ok || !data.success) {
      return;
    }

    state.scores = {};

    data.predictions.forEach(prediction => {
      state.scores[prediction.match_id] = {
        home: prediction.home_score,
        away: prediction.away_score,
        savedAt: prediction.updated_at || new Date().toISOString()
      };
    });

    saveScores();
    updateSummary();

    if ($("#matchesGrid")) {
      renderMatches();
    }
  } catch (error) {
    console.warn("Não foi possível carregar os palpites salvos.");
  }
}
'@

$html = $html -replace 'async function checkLoggedUser\(\) \{', "$helperFunctions`nasync function checkLoggedUser() {"

$html = $html -replace 'state.user = data.user;\s*renderRegisteredState\(\);', @'
state.user = data.user;
renderRegisteredState();
await loadPredictionsFromServer();
'@

$html = $html -replace 'renderRegisteredState\(\);\s*showToast\(successMessage\);', @'
renderRegisteredState();
await loadPredictionsFromServer();
showToast(successMessage);
'@

Set-Content $path $html -Encoding UTF8

Write-Host "Carregamento de palpites integrado ao login."