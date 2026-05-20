$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$replacements = @{
  "Ã¡" = "á"
  "Ã " = "à"
  "Ã¢" = "â"
  "Ã£" = "ã"
  "Ã¤" = "ä"
  "Ã©" = "é"
  "Ãª" = "ê"
  "Ã­" = "í"
  "Ã³" = "ó"
  "Ã´" = "ô"
  "Ãµ" = "õ"
  "Ãº" = "ú"
  "Ã¼" = "ü"
  "Ã§" = "ç"

  "Ã" = "Á"
  "Ã€" = "À"
  "Ã‚" = "Â"
  "Ãƒ" = "Ã"
  "Ã‰" = "É"
  "ÃŠ" = "Ê"
  "Ã" = "Í"
  "Ã“" = "Ó"
  "Ã”" = "Ô"
  "Ã•" = "Õ"
  "Ãš" = "Ú"
  "Ã‡" = "Ç"

  "â€”" = "-"
  "â€“" = "-"
  "â€¢" = "•"
  "â€¦" = "..."
  "â€˜" = "'"
  "â€™" = "'"
  "â€œ" = '"'
  "â€" = '"'
  "Â " = " "
  "Âº" = "º"
  "Âª" = "ª"
}

foreach ($key in $replacements.Keys) {
  $html = $html.Replace($key, $replacements[$key])
}

# Evita símbolo especial quebrado no valor inicial da data
$html = $html.Replace('<strong id="selectedDayLabel">—</strong>', '<strong id="selectedDayLabel">-</strong>')
$html = $html.Replace('<strong id="selectedDayLabel">â€”</strong>', '<strong id="selectedDayLabel">-</strong>')

# Garante charset correto
if ($html -notmatch '<meta charset="UTF-8"') {
  $html = $html -replace '<head>', '<head><meta charset="UTF-8" />'
}

# Força fonte segura para acentos
$css = @'
  <style id="encoding-font-fix">
    body,
    button,
    input,
    select,
    textarea,
    p,
    span,
    strong,
    a,
    label {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif !important;
      text-rendering: geometricPrecision;
    }
  </style>
'@

if ($html -notmatch 'id="encoding-font-fix"') {
  $html = $html -replace '</head>', "$css`n</head>"
}

Set-Content $path $html -Encoding UTF8

Write-Host "Acentuacao e simbolos corrigidos."