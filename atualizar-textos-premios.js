const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const prizes = [
  "Televisão 50 polegadas Smart 4K",
  "Forno Fogatti elétrico de embutir 50L Black 220V",
  "Forno Dako elétrico 44L Supreme Titanium",
  "Purificador de água Colormaq eletrônico Premium",
  "Furadeira de impacto Schulz 1/2 500W",
  "Bebedouro Colormaq Premium branco 220V",
  "Forno Dako elétrico 44L Supreme Titanium",
  "Grill Mondial redondo Cook & Grill Premium",
  "Sanduicheira Mondial Fast Grill 750W 220V preta",
  "Fritadeira Mondial New Pratic 3,5L 1500W 220V preta",
  "Parafusadeira Schulz a bateria 12V com acessórios"
];

const carouselSection = `
      <section class="section reveal" id="carrosselOnze">
        <div class="section-head">
          <div>
            <span class="section-kicker">Interativo</span>
            <h2>Premiação Especial</h2>
            <p>
              Confira os 11 prêmios especiais da Copa Solar. Navegue pelos cards usando os botões, arrastando para o lado ou deslizando no celular.
            </p>
          </div>

          <div class="carousel-buttons">
            <button class="icon-btn" id="carousel11Prev" type="button" aria-label="Card anterior">‹</button>
            <button class="icon-btn" id="carousel11Next" type="button" aria-label="Próximo card">›</button>
          </div>
        </div>

        <div class="carousel-11-wrap">
          <div class="carousel-11-track" id="carousel11Track">
            ${prizes.map((description, index) => {
              const number = String(index + 1).padStart(2, "0");
              const image = `imagens-cards/card-${number}.png`;

              return `
                <article class="carousel-11-card">
                  <div class="carousel-11-image-area">
                    <img
                      class="carousel-11-image"
                      src="${image}"
                      alt="${description}"
                      loading="lazy"
                    />
                  </div>

                  <div class="carousel-11-content">
                    <span class="carousel-11-number">${number}</span>
                    <h3>Prêmio ${number}</h3>
                    <p>${description}</p>
                  </div>
                </article>
              `;
            }).join("")}
          </div>
        </div>

        <div class="carousel-11-dots" id="carousel11Dots" aria-label="Indicadores do carrossel"></div>
      </section>
`;

html = html.replace(
  /<section class="section reveal" id="carrosselOnze">[\s\S]*?<\/section>/,
  carouselSection
);

fs.writeFileSync(path, html, "utf8");

console.log("Descricoes dos premios atualizadas.");