$path = "public\index.html"

$html = Get-Content $path -Raw -Encoding UTF8

$dailySection = @'
      <section class="section reveal" id="jogosDoDia">
        <div class="section-head">
          <div>
            <span class="section-kicker">Agenda diária</span>
            <h2>Jogos do Dia</h2>
            <p>
              Escolha uma data para ver todos os jogos daquele dia. Os palpites só podem ser salvos antes do início da partida.
            </p>
          </div>
        </div>

        <div class="chips" id="dayChips" aria-label="Filtro por dia dos jogos"></div>

        <div class="summary-panel reveal">
          <div class="summary-card">
            <strong id="dailyMatchesCount">0</strong>
            <span>jogos no dia</span>
          </div>

          <div class="summary-card">
            <strong id="selectedDayLabel">—</strong>
            <span>data selecionada</span>
          </div>
        </div>

        <div class="matches-grid" id="dailyMatchesGrid"></div>
      </section>

'@

$html = $html -replace '<section class="section reveal" id="destaques">', "$dailySection      <section class=`"section reveal`" id=`"destaques`">"

Set-Content $path $html -Encoding UTF8

Write-Host "Secao Jogos do Dia adicionada ao HTML."