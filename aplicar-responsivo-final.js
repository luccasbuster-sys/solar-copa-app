const fs = require("fs");

const path = "public/index.html";
let html = fs.readFileSync(path, "utf8");

const responsiveCss = `
  <style id="responsive-final-fix">
    html,
    body {
      width: 100%;
      max-width: 100%;
      overflow-x: hidden !important;
    }

    body {
      min-width: 0 !important;
    }

    .shell,
    .topbar,
    .footer {
      width: min(var(--max), calc(100% - 28px)) !important;
      max-width: calc(100vw - 28px) !important;
    }

    .topbar {
      flex-wrap: wrap !important;
    }

    .brand {
      min-width: 0 !important;
    }

    .brand strong,
    .brand small {
      overflow-wrap: anywhere !important;
    }

    .nav {
      min-width: 0 !important;
    }

    .nav a,
    .user-chip,
    .btn,
    .mini-btn,
    .chip {
      min-width: 0 !important;
      white-space: normal !important;
      text-align: center !important;
    }

    .hero,
    main,
    .section,
    .footer {
      min-width: 0 !important;
    }

    .hero-grid,
    .highlight-grid,
    .matches-grid,
    .summary-panel,
    .stats-row {
      min-width: 0 !important;
    }

    .hero-grid > *,
    .highlight-grid > *,
    .matches-grid > *,
    .summary-panel > *,
    .stats-row > * {
      min-width: 0 !important;
    }

    h1,
    h2,
    h3,
    .card-title,
    .section h2,
    .spotlight h3,
    .gradient-text {
      max-width: 100% !important;
      overflow-wrap: anywhere !important;
      word-break: normal !important;
    }

    .lead,
    .card-subtitle,
    .section p,
    .form-hint,
    .footer p,
    .save-status {
      overflow-wrap: anywhere !important;
    }

    img,
    video {
      max-width: 100% !important;
    }

    .registration-card,
    .carousel-wrap,
    .match-card,
    .summary-card,
    .highlight-item,
    .spotlight,
    .group-card,
    .footer {
      max-width: 100% !important;
    }

    .groups-track {
      max-width: 100% !important;
    }

    .carousel-viewport {
      max-width: 100% !important;
      overflow: hidden !important;
    }

    .team-display,
    .side,
    .team-row,
    .team-info {
      min-width: 0 !important;
    }

    .side strong,
    .team-name {
      overflow-wrap: anywhere !important;
      white-space: normal !important;
    }

    .versus {
      min-width: 0 !important;
    }

    .score-box {
      max-width: 100% !important;
    }

    .score-box input {
      min-width: 0 !important;
    }

    #leaderboardGrid .match-card h3 {
      overflow-wrap: anywhere !important;
    }

    @media (max-width: 1024px) {
      .hero-grid,
      .highlight-grid {
        grid-template-columns: 1fr !important;
      }

      .matches-grid {
        grid-template-columns: 1fr !important;
      }

      .summary-panel {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .group-card {
        flex: 0 0 calc((100% - 16px) / 2) !important;
      }

      .section-head {
        align-items: flex-start !important;
        flex-direction: column !important;
      }

      .section-head .btn {
        width: 100% !important;
      }
    }

    @media (max-width: 760px) {
      .shell {
        width: calc(100% - 20px) !important;
        max-width: calc(100vw - 20px) !important;
      }

      .topbar {
        width: calc(100% - 20px) !important;
        max-width: calc(100vw - 20px) !important;
        top: 10px !important;
        margin-top: 10px !important;
        padding: 10px !important;
        border-width: 3px !important;
        border-radius: 26px !important;
        box-shadow: 5px 5px 0 var(--black) !important;
      }

      .brand {
        width: 100% !important;
      }

      .brand-mark {
        width: 42px !important;
        height: 42px !important;
        flex: 0 0 auto !important;
      }

      .nav {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      .nav a,
      .user-chip {
        width: 100% !important;
        padding: 10px 8px !important;
        font-size: 10px !important;
        line-height: 1.2 !important;
      }

      .user-chip:not([hidden]) {
        grid-column: 1 / -1 !important;
      }

      .hero {
        min-height: auto !important;
        padding: 36px 0 30px !important;
      }

      .hero-grid {
        gap: 26px !important;
      }

      h1 {
        font-size: clamp(36px, 13vw, 62px) !important;
        line-height: .9 !important;
        letter-spacing: -.055em !important;
      }

      .gradient-text {
        padding: .04em .08em .09em !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 var(--black) !important;
        text-shadow: 2px 2px 0 var(--black) !important;
      }

      .lead {
        margin-top: 18px !important;
        font-size: 15px !important;
        line-height: 1.5 !important;
      }

      .hero-actions {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }

      .btn {
        width: 100% !important;
        min-height: 48px !important;
        padding: 0 14px !important;
        border-width: 3px !important;
        box-shadow: 5px 5px 0 var(--black) !important;
        font-size: 11px !important;
      }

      .registration-card {
        padding: 18px !important;
        border-width: 4px !important;
        border-radius: 26px !important;
        box-shadow: 7px 7px 0 var(--black) !important;
      }

      .card-title {
        font-size: clamp(28px, 11vw, 42px) !important;
        line-height: .9 !important;
      }

      input,
      select {
        min-height: 50px !important;
        border-width: 3px !important;
        border-radius: 15px !important;
        box-shadow: 4px 4px 0 var(--black) !important;
        font-size: 14px !important;
      }

      .stats-row,
      .summary-panel {
        grid-template-columns: 1fr !important;
      }

      .section {
        padding: 34px 0 !important;
      }

      .section h2 {
        font-size: clamp(30px, 11vw, 48px) !important;
        line-height: .9 !important;
        letter-spacing: -.055em !important;
      }

      .section-head {
        gap: 14px !important;
        margin-bottom: 18px !important;
      }

      .chips {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      .chip {
        width: 100% !important;
        min-height: 42px !important;
        padding: 0 8px !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 var(--black) !important;
        font-size: 10px !important;
      }

      .carousel-wrap {
        border-width: 4px !important;
        border-radius: 26px !important;
        box-shadow: 7px 7px 0 var(--black) !important;
      }

      .carousel-toolbar {
        align-items: flex-start !important;
        flex-direction: column !important;
        padding: 13px !important;
        border-bottom-width: 4px !important;
      }

      .carousel-toolbar strong {
        font-size: 18px !important;
      }

      .carousel-buttons {
        width: 100% !important;
        justify-content: space-between !important;
      }

      .icon-btn {
        width: 42px !important;
        height: 42px !important;
        border-width: 3px !important;
      }

      .groups-track {
        gap: 12px !important;
        padding: 12px !important;
      }

      .group-card {
        flex: 0 0 100% !important;
        min-height: auto !important;
        padding: 16px !important;
        border-width: 4px !important;
        border-radius: 22px !important;
        box-shadow: 5px 5px 0 var(--black) !important;
      }

      .group-top {
        gap: 10px !important;
      }

      .group-letter {
        width: 52px !important;
        height: 52px !important;
        border-width: 3px !important;
        font-size: 26px !important;
      }

      .group-card h3 {
        font-size: 28px !important;
      }

      .team-row {
        padding: 10px !important;
        border-width: 3px !important;
        box-shadow: 3px 3px 0 var(--black) !important;
      }

      .matches-grid {
        grid-template-columns: 1fr !important;
        gap: 16px !important;
      }

      .match-card {
        padding: 15px !important;
        border-width: 4px !important;
        border-radius: 23px !important;
        box-shadow: 5px 5px 0 var(--black) !important;
      }

      .match-meta {
        align-items: flex-start !important;
      }

      .tag,
      .group-badge,
      .section-kicker,
      .eyebrow {
        border-width: 3px !important;
        box-shadow: 3px 3px 0 var(--black) !important;
        font-size: 9px !important;
        line-height: 1.25 !important;
      }

      .versus {
        grid-template-columns: 1fr !important;
        gap: 12px !important;
      }

      .score-box {
        width: min(100%, 240px) !important;
        justify-self: center !important;
        justify-content: center !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 var(--black) !important;
      }

      .score-box input {
        width: 58px !important;
        min-height: 46px !important;
        font-size: 20px !important;
      }

      .real-flag,
      .side .flag,
      .flag {
        width: 48px !important;
        height: 48px !important;
      }

      .match-actions {
        align-items: stretch !important;
        flex-direction: column !important;
      }

      .mini-btn {
        width: 100% !important;
        min-height: 42px !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 var(--black) !important;
        font-size: 10px !important;
      }

      .summary-card {
        padding: 16px !important;
        border-width: 4px !important;
        border-radius: 20px !important;
        box-shadow: 5px 5px 0 var(--black) !important;
      }

      .summary-card strong {
        font-size: 32px !important;
      }

      .spotlight,
      .highlight-item,
      .footer {
        border-width: 4px !important;
        border-radius: 24px !important;
        box-shadow: 5px 5px 0 var(--black) !important;
      }

      .footer {
        width: calc(100% - 20px) !important;
        max-width: calc(100vw - 20px) !important;
        padding: 18px !important;
      }

      .toast {
        width: calc(100% - 24px) !important;
        bottom: 14px !important;
        border-width: 3px !important;
        box-shadow: 4px 4px 0 var(--black) !important;
        font-size: 10px !important;
      }
    }

    @media (max-width: 430px) {
      .shell {
        width: calc(100% - 16px) !important;
      }

      .topbar {
        width: calc(100% - 16px) !important;
      }

      .nav {
        grid-template-columns: 1fr !important;
      }

      h1 {
        font-size: clamp(34px, 14vw, 54px) !important;
      }

      .section h2 {
        font-size: clamp(28px, 11vw, 42px) !important;
      }

      .chips {
        grid-template-columns: 1fr 1fr !important;
      }

      .score-box input {
        width: 52px !important;
      }

      .registration-card,
      .match-card,
      .carousel-wrap,
      .summary-card,
      .group-card,
      .footer {
        box-shadow: 4px 4px 0 var(--black) !important;
      }
    }
  </style>
`;

if (html.includes('id="responsive-final-fix"')) {
  html = html.replace(
    /<style id="responsive-final-fix">[\s\S]*?<\/style>/,
    responsiveCss
  );
} else {
  html = html.replace("</head>", `${responsiveCss}\n</head>`);
}

fs.writeFileSync(path, html, "utf8");

console.log("Responsividade final aplicada.");