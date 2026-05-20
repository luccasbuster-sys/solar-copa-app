const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const animationCss = `
  <style id="login-hero-animation">
    body.is-registered .hero h1 {
      animation: heroWelcomeIn 900ms cubic-bezier(.2,.8,.2,1) both;
      transform-origin: left center;
    }

    body.is-registered .hero h1 .gradient-text {
      position: relative;
      overflow: hidden;
      animation: roundBadgePop 950ms cubic-bezier(.2,.8,.2,1) 160ms both;
    }

    body.is-registered .hero h1 .gradient-text::after {
      content: "";
      position: absolute;
      inset: -20%;
      background: linear-gradient(
        110deg,
        transparent 0%,
        transparent 38%,
        rgba(255,255,255,.82) 48%,
        transparent 58%,
        transparent 100%
      );
      transform: translateX(-130%) skewX(-18deg);
      animation: roundShine 1.4s cubic-bezier(.2,.8,.2,1) 450ms both;
      pointer-events: none;
    }

    body.is-registered #heroLead {
      animation: heroLeadIn 800ms cubic-bezier(.2,.8,.2,1) 220ms both;
    }

    @keyframes heroWelcomeIn {
      from {
        opacity: 0;
        transform: translateY(28px) scale(.97);
        filter: blur(8px);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }

    @keyframes roundBadgePop {
      0% {
        transform: translateY(16px) scale(.92) rotate(-1deg);
        filter: saturate(.7);
      }

      70% {
        transform: translateY(-3px) scale(1.035) rotate(.5deg);
        filter: saturate(1.15);
      }

      100% {
        transform: translateY(0) scale(1) rotate(0);
        filter: saturate(1);
      }
    }

    @keyframes roundShine {
      from {
        transform: translateX(-130%) skewX(-18deg);
      }

      to {
        transform: translateX(130%) skewX(-18deg);
      }
    }

    @keyframes heroLeadIn {
      from {
        opacity: 0;
        transform: translateY(18px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      body.is-registered .hero h1,
      body.is-registered .hero h1 .gradient-text,
      body.is-registered .hero h1 .gradient-text::after,
      body.is-registered #heroLead {
        animation: none !important;
        transform: none !important;
        filter: none !important;
      }
    }
  </style>
`;

if (html.includes('id="login-hero-animation"')) {
  html = html.replace(
    /<style id="login-hero-animation">[\s\S]*?<\/style>/,
    animationCss
  );
} else {
  html = html.replace("</head>", `${animationCss}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Animacao de entrada do login aplicada.");