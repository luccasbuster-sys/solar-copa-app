$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$helpers = @'
function teamDisplayName(name) {
  const names = {
    "Mexico": "México",
    "South Africa": "África do Sul",
    "Korea Republic": "Coreia do Sul",
    "Czechia": "Tchéquia",
    "Canada": "Canadá",
    "Bosnia and Herzegovina": "Bósnia e Herzegovina",
    "Qatar": "Catar",
    "Switzerland": "Suíça",
    "USA": "Estados Unidos",
    "Paraguay": "Paraguai",
    "Australia": "Austrália",
    "Türkiye": "Turquia",
    "Brazil": "Brasil",
    "Morocco": "Marrocos",
    "Haiti": "Haiti",
    "Scotland": "Escócia",
    "Germany": "Alemanha",
    "Curaçao": "Curaçao",
    "Côte d'Ivoire": "Costa do Marfim",
    "Ecuador": "Equador",
    "Netherlands": "Países Baixos",
    "Japan": "Japão",
    "Sweden": "Suécia",
    "Tunisia": "Tunísia",
    "Spain": "Espanha",
    "Cabo Verde": "Cabo Verde",
    "Saudi Arabia": "Arábia Saudita",
    "Uruguay": "Uruguai",
    "Belgium": "Bélgica",
    "Egypt": "Egito",
    "IR Iran": "Irã",
    "New Zealand": "Nova Zelândia",
    "France": "França",
    "Senegal": "Senegal",
    "Iraq": "Iraque",
    "Norway": "Noruega",
    "Argentina": "Argentina",
    "Algeria": "Argélia",
    "Austria": "Áustria",
    "Jordan": "Jordânia",
    "Portugal": "Portugal",
    "Congo DR": "RD Congo",
    "Uzbekistan": "Uzbequistão",
    "Colombia": "Colômbia",
    "England": "Inglaterra",
    "Croatia": "Croácia",
    "Ghana": "Gana",
    "Panama": "Panamá"
  };

  return names[name] || name;
}

function teamFlag(name) {
  const flags = {
    "Mexico": "🇲🇽",
    "South Africa": "🇿🇦",
    "Korea Republic": "🇰🇷",
    "Czechia": "🇨🇿",
    "Canada": "🇨🇦",
    "Bosnia and Herzegovina": "🇧🇦",
    "Qatar": "🇶🇦",
    "Switzerland": "🇨🇭",
    "USA": "🇺🇸",
    "Paraguay": "🇵🇾",
    "Australia": "🇦🇺",
    "Türkiye": "🇹🇷",
    "Brazil": "🇧🇷",
    "Morocco": "🇲🇦",
    "Haiti": "🇭🇹",
    "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "Germany": "🇩🇪",
    "Curaçao": "🇨🇼",
    "Côte d'Ivoire": "🇨🇮",
    "Ecuador": "🇪🇨",
    "Netherlands": "🇳🇱",
    "Japan": "🇯🇵",
    "Sweden": "🇸🇪",
    "Tunisia": "🇹🇳",
    "Spain": "🇪🇸",
    "Cabo Verde": "🇨🇻",
    "Saudi Arabia": "🇸🇦",
    "Uruguay": "🇺🇾",
    "Belgium": "🇧🇪",
    "Egypt": "🇪🇬",
    "IR Iran": "🇮🇷",
    "New Zealand": "🇳🇿",
    "France": "🇫🇷",
    "Senegal": "🇸🇳",
    "Iraq": "🇮🇶",
    "Norway": "🇳🇴",
    "Argentina": "🇦🇷",
    "Algeria": "🇩🇿",
    "Austria": "🇦🇹",
    "Jordan": "🇯🇴",
    "Portugal": "🇵🇹",
    "Congo DR": "🇨🇩",
    "Uzbekistan": "🇺🇿",
    "Colombia": "🇨🇴",
    "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "Croatia": "🇭🇷",
    "Ghana": "🇬🇭",
    "Panama": "🇵🇦"
  };

  return flags[name] || "🏳️";
}

function teamBlock(name) {
  return `
    <div class="flag" aria-hidden="true">
      <span class="flag-fallback" style="display:grid;font-size:22px;background:#fff;">${teamFlag(name)}</span>
    </div>
    <strong>${teamDisplayName(name)}</strong>
  `;
}
'@

# Insere helpers antes de renderMatches
$html = $html -replace 'function renderMatches\(\) \{', "$helpers`n`nfunction renderMatches() {"

# Troca nomes crus pelos blocos com bandeira no renderMatches novo
$html = $html -replace '<strong>\$\{match\.home_team\}</strong>', '${teamBlock(match.home_team)}'
$html = $html -replace '<strong>\$\{match\.away_team\}</strong>', '${teamBlock(match.away_team)}'

# Corrige aria-labels para português também
$html = $html -replace 'Palpite de \$\{match\.home_team\} contra \$\{match\.away_team\}', 'Palpite de ${teamDisplayName(match.home_team)} contra ${teamDisplayName(match.away_team)}'
$html = $html -replace 'Gols de \$\{match\.home_team\}', 'Gols de ${teamDisplayName(match.home_team)}'
$html = $html -replace 'Gols de \$\{match\.away_team\}', 'Gols de ${teamDisplayName(match.away_team)}'

Set-Content $path $html -Encoding UTF8

Write-Host "Bandeiras e nomes em portugues aplicados."