const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const css = `
  <style id="mobile-app-final">
    @media (max-width: 760px) {
      html,
      body {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden !important;
        background: #fffaf0 !important;
      }

      body {
        padding: 0 !important;
      }

      .shell {
        width: 100% !important;
        max-width: 100% !important;
        padding: 0 14px !important;
      }

      .topbar {
        position: sticky !important;
        top: 8px !important;
        z-index: 50 !important;
        width: calc(100% - 20px) !important;
        margin: 8px auto 0 !important;
        padding: 8px !important;
        border-radius: 22px !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 #050505 !important;
        background: rgba(255, 255, 255, .92) !important;
        backdrop-filter: blur(12px) !important;
      }

      .brand {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        width: 100% !important;
      }

      .brand-mark {
        width: 38px !important;
        height: 38px !important;
      }

      .brand strong {
        font-size: 12px !important;
        line-height: 1 !important;
      }

      .brand small {
        font-size: 9px !important;
      }

      .nav {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 6px !important;
        margin-top: 8px !important;
      }

      .nav a,
      .user-chip {
        min-height: 34px !important;
        padding: 6px 7px !important;
        border-width: 2px !important;
        border-radius: 999px !important;
        box-shadow: 2px 2px 0 #050505 !important;
        font-size: 8px !important;
        line-height: 1.1 !important;
      }

      .hero {
        min-height: auto !important;
        padding: 24px 0 18px !important;
      }

      .hero-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 22px !important;
      }

      .eyebrow {
        max-width: 100% !important;
        font-size: 8px !important;
        padding: 7px 10px !important;
        border-width: 2px !important;
        box-shadow: 2px 2px 0 #050505 !important;
      }

      h1 {
        font-size: clamp(40px, 16vw, 68px) !important;
        line-height: .82 !important;
        letter-spacing: -.07em !important;
        margin-top: 14px !important;
      }

      .gradient-text {
        display: inline-block !important;
        max-width: 100% !important;
        padding: .05em .08em .08em !important;
        border-radius: 12px !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 #050505 !important;
        text-shadow: 2px 2px 0 #050505 !important;
      }

      .lead {
        font-size: 14px !important;
        line-height: 1.45 !important;
        margin-top: 14px !important;
      }

      .hero-actions {
        display: none !important;
      }

      .registration-card {
        width: 100% !important;
        padding: 18px !important;
        border-width: 4px !important;
        border-radius: 26px !important;
        box-shadow: 6px 6px 0 #050505 !important;
      }

      .card-title {
        font-size: clamp(30px, 11vw, 46px) !important;
        line-height: .9 !important;
        margin-bottom: 8px !important;
      }

      .card-subtitle {
        font-size: 12px !important;
        line-height: 1.35 !important;
      }

      .form-grid {
        gap: 11px !important;
      }

      .form-grid label {
        font-size: 9px !important;
      }

      input,
      select {
        min-height: 48px !important;
        padding: 0 13px !important;
        border-width: 3px !important;
        border-radius: 16px !important;
        box-shadow: 3px 3px 0 #050505 !important;
        font-size: 13px !important;
      }

      .form-hint,
      .form-error {
        font-size: 11px !important;
        line-height: 1.35 !important;
      }

      .btn {
        min-height: 48px !important;
        border-width: 3px !important;
        border-radius: 999px !important;
        box-shadow: 4px 4px 0 #050505 !important;
        font-size: 10px !important;
        padding: 0 12px !important;
      }

      .stats-row {
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 8px !important;
      }

      .stat {
        padding: 10px 8px !important;
        border-width: 3px !important;
        border-radius: 16px !important;
        box-shadow: 3px 3px 0 #050505 !important;
      }

      .stat strong {
        font-size: 25px !important;
      }

      .stat span {
        font-size: 8px !important;
      }

      .section {
        padding: 26px 0 !important;
      }

      .section-head {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 12px !important;
        margin-bottom: 15px !important;
      }

      .section h2 {
        font-size: clamp(32px, 12vw, 52px) !important;
        line-height: .86 !important;
        letter-spacing: -.06em !important;
      }

      .section p {
        font-size: 12px !important;
        line-height: 1.4 !important;
      }

      .section-kicker {
        font-size: 8px !important;
        padding: 7px 10px !important;
        border-width: 2px !important;
        box-shadow: 2px 2px 0 #050505 !important;
      }

      .summary-panel {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 9px !important;
      }

      .summary-card {
        padding: 13px !important;
        border-width: 3px !important;
        border-radius: 18px !important;
        box-shadow: 4px 4px 0 #050505 !important;
      }

      .summary-card strong {
        font-size: 30px !important;
        line-height: 1 !important;
      }

      .summary-card span {
        font-size: 9px !important;
      }

      .matches-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 14px !important;
      }

      .match-card {
        padding: 14px !important;
        border-width: 3px !important;
        border-radius: 22px !important;
        box-shadow: 4px 4px 0 #050505 !important;
      }

      .match-meta {
        gap: 7px !important;
      }

      .tag {
        font-size: 8px !important;
        padding: 6px 8px !important;
        border-width: 2px !important;
        box-shadow: 2px 2px 0 #050505 !important;
      }

      .versus {
        grid-template-columns: 1fr !important;
        gap: 12px !important;
        text-align: center !important;
      }

      .side {
        display: grid !important;
        justify-items: center !important;
        gap: 7px !important;
      }

      .team-display {
        gap: 7px !important;
      }

      .real-flag,
      .side .flag,
      .flag {
        width: 48px !important;
        height: 48px !important;
        border-width: 3px !important;
        box-shadow: 3px 3px 0 #050505 !important;
      }

      .side strong {
        font-size: 14px !important;
      }

      .score-box {
        justify-self: center !important;
        width: min(100%, 230px) !important;
        padding: 8px !important;
        border-width: 3px !important;
        border-radius: 18px !important;
        box-shadow: 3px 3px 0 #050505 !important;
      }

      .score-box input {
        width: 56px !important;
        min-height: 44px !important;
        font-size: 20px !important;
        padding: 0 !important;
      }

      .match-actions {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 9px !important;
      }

      .mini-btn {
        width: 100% !important;
        min-height: 42px !important;
        border-width: 3px !important;
        border-radius: 999px !important;
        box-shadow: 3px 3px 0 #050505 !important;
        font-size: 9px !important;
      }

      .save-status {
        font-size: 10px !important;
      }

      #carrosselOnze .section-head {
        grid-template-columns: 1fr !important;
      }

      #carrosselOnze .carousel-buttons {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 8px !important;
        width: 100% !important;
      }

      #carrosselOnze .icon-btn {
        width: 100% !important;
        height: 44px !important;
        border-radius: 999px !important;
        border-width: 3px !important;
        box-shadow: 3px 3px 0 #050505 !important;
      }

      .carousel-11-wrap {
        border-width: 3px !important;
        border-radius: 24px !important;
        box-shadow: 5px 5px 0 #050505 !important;
      }

      .carousel-11-track {
        padding: 14px !important;
        gap: 14px !important;
        scroll-padding: 14px !important;
      }

      .carousel-11-card {
        flex: 0 0 calc(100vw - 56px) !important;
        min-height: auto !important;
        padding: 14px !important;
        border-width: 3px !important;
        border-radius: 22px !important;
        box-shadow: 4px 4px 0 #050505 !important;
        transform: none !important;
      }

      .carousel-11-card.is-active {
        transform: none !important;
        box-shadow: 5px 5px 0 #050505 !important;
      }

      .carousel-11-image-area {
        height: 230px !important;
        padding: 10px !important;
        border-width: 3px !important;
        border-radius: 18px !important;
        box-shadow: 3px 3px 0 #050505 !important;
      }

      .carousel-11-number {
        width: 42px !important;
        height: 42px !important;
        border-width: 3px !important;
        box-shadow: 3px 3px 0 #050505 !important;
        font-size: 12px !important;
      }

      .carousel-11-card h3 {
        font-size: clamp(30px, 11vw, 44px) !important;
        line-height: .9 !important;
      }

      .carousel-11-card p {
        font-size: 13px !important;
        line-height: 1.4 !important;
      }

      .carousel-11-dots {
        gap: 7px !important;
        margin-top: 14px !important;
      }

      .carousel-11-dot {
        width: 12px !important;
        height: 12px !important;
        border-width: 2px !important;
      }

      .carousel-wrap {
        border-width: 3px !important;
        border-radius: 24px !important;
        box-shadow: 5px 5px 0 #050505 !important;
      }

      .carousel-toolbar {
        padding: 12px !important;
        border-bottom-width: 3px !important;
      }

      .groups-track {
        padding: 12px !important;
        gap: 12px !important;
      }

      .group-card {
        flex: 0 0 calc(100vw - 56px) !important;
        padding: 14px !important;
        border-width: 3px !important;
        border-radius: 20px !important;
        box-shadow: 4px 4px 0 #050505 !important;
      }

      .group-card h3 {
        font-size: 28px !important;
      }

      .team-row {
        padding: 9px !important;
        border-width: 2px !important;
        border-radius: 12px !important;
        box-shadow: 2px 2px 0 #050505 !important;
      }

      #leaderboardGrid {
        grid-template-columns: 1fr !important;
      }

      #leaderboardGrid .match-card h3 {
        font-size: 26px !important;
        line-height: 1 !important;
      }

      .toast {
        left: 12px !important;
        right: 12px !important;
        bottom: 12px !important;
        width: auto !important;
        border-width: 3px !important;
        border-radius: 18px !important;
        box-shadow: 4px 4px 0 #050505 !important;
        font-size: 11px !important;
      }
    }

    @media (max-width: 430px) {
      .shell {
        padding: 0 10px !important;
      }

      h1 {
        font-size: clamp(38px, 15vw, 58px) !important;
      }

      .registration-card {
        padding: 15px !important;
      }

      .summary-panel {
        grid-template-columns: 1fr !important;
      }

      .carousel-11-card,
      .group-card {
        flex-basis: calc(100vw - 44px) !important;
      }

      .carousel-11-image-area {
        height: 205px !important;
      }

      .nav {
        grid-template-columns: 1fr 1fr !important;
      }
    }
  </style>
`;

if (html.includes('id="mobile-app-final"')) {
  html = html.replace(
    /<style id="mobile-app-final">[\s\S]*?<\/style>/,
    css
  );
} else {
  html = html.replace("</head>", `${css}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Visual mobile estilo app aplicado.");