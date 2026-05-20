$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$html = [regex]::Replace(
  $html,
  '<div class="summary-card">\s*<strong id="selectedDateLabel">[\s\S]*?</div>',
  '',
  1
)

$html = $html -replace '\s*\$\("#selectedDateLabel"\)\.textContent = `Grupo \$\{selectedGroup\}`;', ''

Set-Content $path $html -Encoding UTF8

Write-Host "Bloco de data selecionada removido."