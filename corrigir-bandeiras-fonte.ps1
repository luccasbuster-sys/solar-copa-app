$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$helpers = @'
function teamDisplayName(name) {
  const names = {
    "Mexico": "M\u00e9xico",
    "South Africa": "\u00c1frica do Sul",
    "Korea Republic": "Coreia do Sul",
    "Czechia": "Tch\u00e9quia",
    "Canada": "Canad\u00e1",
    "Bosnia and Herzegovina": "B\u00f3snia e Herzegovina",
    "Qatar": "Catar",
    "Switzerland": "Su\u00ed\u00e7a",
    "USA": "Estados Unidos",
    "Paraguay": "Paraguai",
    "Australia": "Austr\u00e1lia",
    "T\u00fcrkiye": "Turquia",
    "Türkiye": "Turquia",
    "Brazil": "Brasil",
    "Morocco": "Marrocos",
    "Haiti": "Haiti",
    "Scotland": "Esc\u00f3cia",
    "Germany": "Alemanha",
    "Cura\u00e7ao": "Cura\u00e7ao",
    "Curaçao": "Cura\u00e7ao",
    "C\u00f4te d'Ivoire": "Costa do Marfim",
    "Côte d'Ivoire": "Costa do Marfim",
    "Ecuador": "Equador",
    "Netherlands": "Pa\u00edses Baixos",
    "Japan": "Jap\u00e3o",
    "Sweden": "Su\u00e9cia",
    "Tunisia": "Tun\u00edsia",
    "Spain": "Espanha",
    "Cabo Verde": "Cabo Verde",
    "Saudi Arabia": "Ar\u00e1bia Saudita",
    "Uruguay": "Uruguai",
    "Belgium": "B\u00e9lgica",
    "Egypt": "Egito",
    "IR Iran": "Ir\u00e3",
    "New Zealand": "Nova Zel\u00e2ndia",
    "France": "Fran\u00e7a",
    "Senegal": "Senegal",
    "Iraq": "Iraque",
    "Norway": "Noruega",
    "Argentina": "Argentina",
    "Algeria": "Arg\u00e9lia",
    "Austria": "\u00c1ustria",
    "Jordan": "Jord\u00e2nia",
    "Portugal": "Portugal",
    "Congo DR": "RD Congo",
    "Uzbekistan": "Uzbequist\u00e3o",
    "Colombia": "Col\u00f4mbia",
    "England": "Inglaterra",
    "Croatia": "Cro\u00e1cia",
    "Ghana": "Gana",
    "Panama": "Panam\u00e1"
  };

  return names[name] || name;
}

function teamFlagCode(name) {
  const codes = {
    "Mexico": "mx",
    "South Africa": "za",
    "Korea Republic": "kr",
    "Czechia": "cz",
    "Canada": "ca",
    "Bosnia and Herzegovina": "ba",
    "Qatar": "qa",
    "Switzerland": "ch",
    "USA": "us",
    "Paraguay": "py",
    "Australia": "au",
    "T\u00fcrkiye": "tr",
    "Türkiye": "tr",
    "Brazil": "br",
    "Morocco": "ma",
    "Haiti": "ht",
    "Scotland": "gb-sct",
    "Germany": "de",
    "Cura\u00e7ao": "cw",
    "Curaçao": "cw",
    "C\u00f4te d'Ivoire": "ci",
    "Côte d'Ivoire": "ci",
    "Ecuador": "ec",
    "Netherlands": "nl",
    "Japan": "jp",
    "Sweden": "se",
    "Tunisia": "tn",
    "Spain": "es",
    "Cabo Verde": "cv",
    "Saudi Arabia": "sa",
    "Uruguay": "uy",
    "Belgium": "be",
    "Egypt": "eg",
    "IR Iran": "ir",
    "New Zealand": "nz",
    "France": "fr",
    "Senegal": "sn",
    "Iraq": "iq",
    "Norway": "no",
    "Argentina": "ar",
    "Algeria": "dz",
    "Austria": "at",
    "Jordan": "jo",
    "Portugal": "pt",
    "Congo DR": "cd",
    "Uzbekistan": "uz",
    "Colombia": "co",
    "England": "gb-eng",
    "Croatia": "hr",
    "Ghana": "gh",
    "Panama": "pa"
  };

  return codes[name] || "";
}

function teamFlagUrl(name) {
  const code = teamFlagCode(name);

  if (!code) {
    return "";
  }

  return `https://flagcdn.com/w80/${code}.png`;
}

function teamBlock(name) {
  const displayName = teamDisplayName(name);
  const flagUrl = teamFlagUrl(name);

  return `
    <div class="team-display">
      <span class="flag real-flag" aria-hidden="true">
        ${flagUrl ? `<img class="flag-img" src="${flagUrl}" alt="" loading="lazy" />` : `<span class="flag-fallback" style="display:grid;">${displayName.slice(0, 2).toUpperCase()}</span>`}
      </span>
      <strong>${displayName}</strong>
    </div>
  `;
}
'@

# Remove bloco antigo de helpers, se existir
$html = [regex]::Replace(
  $html,
  'function teamDisplayName\(name\) \{[\s\S]*?function teamBlock\(name\) \{[\s\S]*?\n\}',
  '',
  1
)

# Insere helpers novos antes de renderMatches
$html = $html -replace 'function renderMatches\(\) \{', "$helpers`n`nfunction renderMatches() {"

# Garante que os cards usem teamBlock
$html = $html -replace '<strong>\$\{match\.home_team\}</strong>', '${teamBlock(match.home_team)}'
$html = $html -replace '<strong>\$\{match\.away_team\}</strong>', '${teamBlock(match.away_team)}'

# Remove sobras do helper antigo com emoji
$html = [regex]::Replace(
  $html,
  '<div class="flag" aria-hidden="true">\s*<span class="flag-fallback"[\s\S]*?</strong>',
  '',
  0
)

# CSS para fonte com acentuação correta e bandeiras reais
$css = @'
  <style id="font-flag-fix">
    body,
    button,
    input,
    select,
    textarea,
    .lead,
    .section p,
    .card-subtitle,
    .form-hint,
    .team-name,
    .side strong,
    .save-status,
    .footer p {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif !important;
      letter-spacing: normal !important;
    }

    h1,
    .section h2,
    .card-title,
    .spotlight h3,
    .carousel-toolbar strong,
    .brand strong {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif !important;
      font-weight: 1000 !important;
    }

    .team-display {
      display: grid;
      justify-items: center;
      align-items: center;
      gap: 8px;
      text-align: center;
    }

    .real-flag {
      width: 52px !important;
      height: 52px !important;
      display: grid !important;
      place-items: center !important;
      overflow: hidden !important;
      background: #ffffff !important;
      border: 4px solid #050505 !important;
      border-radius: 999px !important;
      box-shadow: 3px 3px 0 #050505 !important;
    }

    .real-flag .flag-img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      display: block !important;
    }

    .side strong {
      color: #050505 !important;
      font-size: 15px !important;
      font-weight: 900 !important;
      line-height: 1.15 !important;
    }
  </style>
'@

if ($html -notmatch 'id="font-flag-fix"') {
  $html = $html -replace '</head>', "$css`n</head>"
}

Set-Content $path $html -Encoding UTF8

Write-Host "Bandeiras reais e fonte segura aplicadas."