const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const carouselCards = Array.from({ length: 11 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const image = `imagens-cards/card-${number}.png`;

  return `
                <article class="carousel-11-card">
                  <div class="carousel-11-image-wrap">
                    <img
                      class="carousel-11-image"
                      src="${image}"
                      alt="Imagem do prêmio ${number}"
                      loading="lazy"
                    />
                  </div>

                  <span class="carousel-11-number">${number}</span>

                  <h3>Prêmio ${number}</h3>

                  <p>
                    Prêmio especial da Copa Solar. Depois podemos ajustar o nome e a descrição de cada card.
                  </p>

                  <button class="mini-btn" type="button">Ver detalhe</button>
                </article>
  `;
}).join("");

html = html.replace(
  /<div class="carousel-11-track" id="carousel11Track">[\s\S]*?<\/div>\s*<\/div>\s*<div class="carousel-11-dots"/,
  `<div class="carousel-11-track" id="carousel11Track">
${carouselCards}
          </div>
        </div>

        <div class="carousel-11-dots"`
);

const imageCss = `
  <style id="carousel-11-image-style">
    .carousel-11-image-wrap {
      width: 100%;
      aspect-ratio: 16 / 10;
      border: 4px solid var(--black);
      border-radius: 22px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 5px 5px 0 var(--black);
      margin-bottom: 18px;
    }

    .carousel-11-image {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .carousel-11-card {
      display: flex;
      flex-direction: column;
    }

    .carousel-11-card .mini-btn {
      margin-top: auto;
    }

    @media (max-width: 760px) {
      .carousel-11-image-wrap {
        border-width: 3px;
        border-radius: 18px;
        box-shadow: 4px 4px 0 var(--black);
      }
    }
  </style>
`;

if (html.includes('id="carousel-11-image-style"')) {
  html = html.replace(
    /<style id="carousel-11-image-style">[\s\S]*?<\/style>/,
    imageCss
  );
} else {
  html = html.replace("</head>", `${imageCss}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Imagens aplicadas aos 11 cards do carrossel.");