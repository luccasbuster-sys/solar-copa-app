const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const carouselSection = `
      <section class="section reveal" id="carrosselOnze">
        <div class="section-head">
          <div>
            <span class="section-kicker">Interativo</span>
            <h2>Carrossel Especial</h2>
            <p>
              Navegue pelos 11 cards interativos. Use os botões, arraste para o lado ou deslize no celular.
            </p>
          </div>

          <div class="carousel-buttons">
            <button class="icon-btn" id="carousel11Prev" type="button" aria-label="Card anterior">‹</button>
            <button class="icon-btn" id="carousel11Next" type="button" aria-label="Próximo card">›</button>
          </div>
        </div>

        <div class="carousel-11-wrap">
          <div class="carousel-11-track" id="carousel11Track">
            ${Array.from({ length: 11 }, (_, index) => {
              const number = String(index + 1).padStart(2, "0");

              return `
                <article class="carousel-11-card">
                  <span class="carousel-11-number">${number}</span>
                  <h3>Card ${number}</h3>
                  <p>
                    Conteúdo interativo do card ${number}. Depois podemos trocar este texto por regras, prêmios, avisos ou informações da Copa.
                  </p>
                  <button class="mini-btn" type="button">Ver detalhe</button>
                </article>
              `;
            }).join("")}
          </div>
        </div>

        <div class="carousel-11-dots" id="carousel11Dots" aria-label="Indicadores do carrossel"></div>
      </section>
`;

const carouselCss = `
  <style id="carousel-11-style">
    #carrosselOnze {
      position: relative;
    }

    .carousel-11-wrap {
      width: 100%;
      overflow: hidden;
      border: 5px solid var(--black);
      border-radius: 34px;
      box-shadow: 9px 9px 0 var(--black);
      background:
        radial-gradient(circle at 15% 15%, rgba(211, 255, 0, .95), transparent 25%),
        radial-gradient(circle at 85% 25%, rgba(33, 211, 202, .95), transparent 28%),
        linear-gradient(135deg, #ffffff, #fff7e8);
    }

    .carousel-11-track {
      display: flex;
      gap: 18px;
      padding: 22px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      scrollbar-width: none;
      cursor: grab;
    }

    .carousel-11-track::-webkit-scrollbar {
      display: none;
    }

    .carousel-11-track.is-dragging {
      cursor: grabbing;
      scroll-behavior: auto;
    }

    .carousel-11-card {
      flex: 0 0 min(360px, 82vw);
      min-height: 280px;
      scroll-snap-align: center;
      border: 5px solid var(--black);
      border-radius: 28px;
      box-shadow: 7px 7px 0 var(--black);
      padding: 24px;
      background: #ffffff;
      position: relative;
      overflow: hidden;
      transform: scale(.96);
      transition:
        transform .28s ease,
        box-shadow .28s ease,
        background .28s ease;
    }

    .carousel-11-card:nth-child(3n + 1) {
      background: linear-gradient(135deg, #d6ff00, #ffffff 72%);
    }

    .carousel-11-card:nth-child(3n + 2) {
      background: linear-gradient(135deg, #21d3ca, #ffffff 72%);
    }

    .carousel-11-card:nth-child(3n + 3) {
      background: linear-gradient(135deg, #ff251f, #ffffff 72%);
    }

    .carousel-11-card.is-active {
      transform: scale(1);
      box-shadow: 11px 11px 0 var(--black);
    }

    .carousel-11-number {
      display: inline-grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border: 4px solid var(--black);
      border-radius: 999px;
      background: #ffffff;
      box-shadow: 4px 4px 0 var(--black);
      font-weight: 1000;
      margin-bottom: 22px;
    }

    .carousel-11-card h3 {
      font-size: clamp(30px, 4vw, 52px);
      line-height: .9;
      letter-spacing: -.05em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .carousel-11-card p {
      font-size: 15px;
      line-height: 1.45;
      margin-bottom: 22px;
      max-width: 28rem;
    }

    .carousel-11-dots {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 20px;
    }

    .carousel-11-dot {
      width: 13px;
      height: 13px;
      border: 3px solid var(--black);
      border-radius: 999px;
      background: #ffffff;
      box-shadow: 2px 2px 0 var(--black);
      cursor: pointer;
      padding: 0;
    }

    .carousel-11-dot.is-active {
      background: #ff251f;
      transform: scale(1.15);
    }

    @media (max-width: 760px) {
      .carousel-11-wrap {
        border-width: 4px;
        border-radius: 26px;
        box-shadow: 6px 6px 0 var(--black);
      }

      .carousel-11-track {
        gap: 14px;
        padding: 16px;
      }

      .carousel-11-card {
        flex-basis: 86vw;
        min-height: 250px;
        border-width: 4px;
        border-radius: 22px;
        box-shadow: 5px 5px 0 var(--black);
        padding: 18px;
      }

      .carousel-11-card h3 {
        font-size: clamp(28px, 11vw, 42px);
      }
    }
  </style>
`;

const carouselJs = `
function setupCarousel11() {
  const track = $("#carousel11Track");
  const prev = $("#carousel11Prev");
  const next = $("#carousel11Next");
  const dots = $("#carousel11Dots");

  if (!track || !prev || !next || !dots) return;

  const cards = Array.from(track.querySelectorAll(".carousel-11-card"));
  let activeIndex = 0;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;

  dots.innerHTML = cards.map((_, index) => \`
    <button class="carousel-11-dot \${index === 0 ? "is-active" : ""}" type="button" data-carousel11-dot="\${index}" aria-label="Ir para card \${index + 1}"></button>
  \`).join("");

  const dotButtons = Array.from(dots.querySelectorAll("[data-carousel11-dot]"));

  function setActive(index) {
    activeIndex = Math.max(0, Math.min(cards.length - 1, index));

    cards.forEach((card, cardIndex) => {
      card.classList.toggle("is-active", cardIndex === activeIndex);
    });

    dotButtons.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === activeIndex);
    });
  }

  function goTo(index) {
    setActive(index);
    cards[activeIndex].scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest"
    });
  }

  function detectActiveByScroll() {
    const center = track.scrollLeft + track.clientWidth / 2;

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(center - cardCenter);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActive(nearestIndex);
  }

  prev.addEventListener("click", () => goTo(activeIndex - 1));
  next.addEventListener("click", () => goTo(activeIndex + 1));

  dotButtons.forEach(dot => {
    dot.addEventListener("click", () => {
      goTo(Number(dot.dataset.carousel11Dot));
    });
  });

  track.addEventListener("scroll", () => {
    window.clearTimeout(track._carousel11Timer);
    track._carousel11Timer = window.setTimeout(detectActiveByScroll, 80);
  });

  track.addEventListener("mousedown", (event) => {
    isDown = true;
    track.classList.add("is-dragging");
    startX = event.pageX - track.offsetLeft;
    scrollLeft = track.scrollLeft;
  });

  track.addEventListener("mouseleave", () => {
    isDown = false;
    track.classList.remove("is-dragging");
  });

  track.addEventListener("mouseup", () => {
    isDown = false;
    track.classList.remove("is-dragging");
    detectActiveByScroll();
  });

  track.addEventListener("mousemove", (event) => {
    if (!isDown) return;
    event.preventDefault();

    const x = event.pageX - track.offsetLeft;
    const walk = (x - startX) * 1.25;
    track.scrollLeft = scrollLeft - walk;
  });

  setActive(0);
}
`;

if (!html.includes('id="carousel-11-style"')) {
  html = html.replace("</head>", `${carouselCss}\n</head>`);
}

if (!html.includes('id="carrosselOnze"')) {
  html = html.replace(
    '<section class="section reveal" id="grupos">',
    `${carouselSection}\n      <section class="section reveal" id="grupos">`
  );
}

if (!html.includes("function setupCarousel11()")) {
  html = html.replace("function setupReveal() {", `${carouselJs}\n\n    function setupReveal() {`);
}

if (!html.includes("setupCarousel11();")) {
  html = html.replace("setupCarousel();", "setupCarousel();\n      setupCarousel11();");
}

fs.writeFileSync(path, html, "utf8");

console.log("Carrossel com 11 cards criado com sucesso.");