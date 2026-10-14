// The sign-in page: warm paper background with line doodles (a student on a laptop,
// a ticked calendar, a rising chart), a white card in the middle, and the dashboard's
// plum / lime / lavender accents. Self-contained: inline CSS and SVG, nothing from public/.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Polka-dot fill for the two blocks at the bottom corners.
const dots = (id, color) => `<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
  <rect width="22" height="22" fill="${color}"/><circle cx="6" cy="7" r="3.2" fill="#2c2445"/><circle cx="17" cy="17" r="2.6" fill="#2c2445"/></pattern>`;

const MINI = `<svg class="doodle mini" viewBox="0 0 390 844" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>${dots('dm', '#d6f56b')}${dots('dn', '#b1b0e0')}</defs>
  <path class="ln" d="M250 150c12-20 22 14 34-4s16-18 28 0 20 8 36-4"/>
  <circle class="ln" cx="360" cy="110" r="4"/>
  <circle class="ln" cx="30" cy="250" r="5"/>
  <path class="ln" d="M150 760c10-14 20 10 30-4s14-14 22 0"/>
  <rect x="-10" y="730" width="70" height="120" fill="url(#dm)"/>
  <rect x="330" y="700" width="70" height="150" fill="url(#dn)"/>
  <circle class="ln" cx="300" cy="770" r="4"/>
</svg>`;

const LEFT = `<svg class="doodle left" viewBox="0 0 300 560" aria-hidden="true">
  <defs>${dots('dl', '#d6f56b')}</defs>
  <path class="ln" d="M20 150c18-30 30 22 46-6s20-26 36 2 30 10 52-6"/>
  <circle class="ln" cx="132" cy="96" r="4"/>
  <circle class="ln" cx="236" cy="300" r="6"/>
  <!-- speech bubble -->
  <path class="ln fill" d="M58 220h120v80H92l-22 22 6-22H58z"/>
  <path class="ln" d="M80 248h74M80 270h48"/>
  <!-- calendar with a tick -->
  <g transform="translate(196 170) rotate(8)">
    <rect class="ln fill" x="0" y="0" width="74" height="70" rx="8"/>
    <path class="ln" d="M0 20h74M18 -6v14M56 -6v14"/>
    <path class="ln tick" d="M22 44l9 9 20-20"/>
  </g>
  <path class="ln" d="M206 376c10-14 20 10 30-4"/>
  <!-- dotted block + chart box -->
  <rect x="24" y="400" width="88" height="160" fill="url(#dl)"/>
  <rect class="ln fill" x="128" y="450" width="92" height="110"/>
  <path class="ln" d="M150 535c18-10 34-30 44-62"/><path class="ln" d="M182 476l12-4 3 12"/>
</svg>`;

const RIGHT = `<svg class="doodle right" viewBox="0 0 340 560" aria-hidden="true">
  <defs>${dots('dr', '#b1b0e0')}</defs>
  <path class="ln" d="M190 70c14-22 24 18 38-4s18-20 30 0 22 8 40-4"/>
  <circle class="ln" cx="300" cy="30" r="4"/>
  <path class="ln" d="M24 40c10-16 22 12 32-2"/>
  <!-- note card -->
  <path class="ln fill" d="M30 110h82v54H52l-16 14 4-14H30z"/>
  <path class="ln" d="M46 130h50M46 146h30"/>
  <!-- 75% badge -->
  <g transform="translate(250 150) rotate(-10)">
    <circle class="ln fill" r="30"/>
    <text x="0" y="6" text-anchor="middle" class="pct">75%</text>
  </g>
  <!-- the student: sitting on a block, laptop on her lap -->
  <g transform="translate(70 214)">
    <rect class="ln fill" x="100" y="170" width="92" height="190"/>
    <path class="ln fill" d="M78 166l20 2-2 128H76z"/>
    <path class="ln fill" d="M160 148l-96-4c-10 0-14 8-12 16 2 8 6 10 14 10l94 2z"/>
    <path class="ln fill" d="M54 158l22 2-2 130H54z"/>
    <path class="ink" d="M54 290h20l2 10H40c0-6 6-10 14-10zM76 296h20l2 10H62c0-6 6-10 14-10z"/>
    <path class="ink" d="M108 92c12-8 34-8 46 2l8 64h-58z"/>
    <path class="dash" d="M116 104l4 6M132 100l3 7M146 110l-3 6M120 126l4 5M138 124l3 6M152 134l-3 6M114 146l4 5M130 148l3 6"/>
    <path class="ink" d="M146 38c22-4 38 10 44 30 4 14 14 20 22 22-14 6-30 0-38-14-6-10-14-14-26-16z"/>
    <circle class="ink" cx="136" cy="20" r="10"/>
    <circle class="ink" cx="136" cy="50" r="24"/>
    <path class="skin" d="M112 50c0-12 10-20 20-18 2 10 10 16 18 18 0 14-8 26-20 26s-18-12-18-26z"/>
    <path class="ln" d="M128 76v14"/>
    <path class="ln lime" d="M58 78l24-6 32 72-24 6z"/>
    <path class="ln" d="M88 146h52"/>
    <path class="ln fill" d="M122 98c-14 14-22 28-26 44l12 2c4-14 10-26 22-38z"/>
  </g>
  <rect x="270" y="410" width="62" height="150" fill="url(#dr)"/>
  <path class="ln" d="M14 330l26-18M22 350l30-8"/>
</svg>`;

export const loginPage = (error = '') => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>NERIST Attendance · Sign in</title>
  <meta name="theme-color" content="#f6f1e9" />
  <meta name="robots" content="noindex" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%232c2445'/%3E%3Cpath d='M10 16.5l4 4L22.5 12' fill='none' stroke='%23d6f56b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --paper: #f6f1e9; --panel: #ffffff; --line: #ece7df; --field: #ffffff;
      --ink: #2c2445; --ink-2: #6f6b8c; --ink-3: #a19fbb;
      --plum: #2c2445; --lime: #d6f56b; --lav: #7471b8; --pink: #f8c2d8; --pink-ink: #8a2550;
      --font: "Urbanist", system-ui, -apple-system, "Segoe UI", sans-serif;
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0; min-height: 100dvh; color: var(--ink); background: var(--paper);
      font: 500 15px/1.4 var(--font); -webkit-font-smoothing: antialiased; overflow-x: hidden;
      display: grid; grid-template-rows: auto 1fr auto;
    }
    header { display: flex; align-items: flex-start; justify-content: space-between; padding: 28px 16px 0; position: relative; z-index: 2; }
    @media (min-width: 760px) { header { padding: 36px 64px 0; } }
    .brand { display: grid; gap: 10px; }
    .brand b { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.25rem; letter-spacing: -0.01em; }
    .logo { width: 34px; height: 34px; border-radius: 50%; background: var(--plum); display: grid; place-items: center; }
    .logo svg { width: 18px; height: 18px; fill: none; stroke: var(--lime); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
    .brand small { padding-top: 10px; border-top: 1px solid var(--ink-3); font-size: 0.8125rem; color: var(--ink-2); font-weight: 600; }

    main { position: relative; display: grid; place-items: center; padding: 28px 16px; }
    .doodle { position: fixed; bottom: 0; pointer-events: none; z-index: 0; height: min(78vh, 600px); width: auto; }
    .doodle.left { left: max(0px, calc(50% - 640px)); }
    .doodle.right { right: max(0px, calc(50% - 660px)); }
    .ln { fill: none; stroke: var(--ink); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
    .ln.fill { fill: #fff; }
    .ln.lime { fill: var(--lime); }
    .ln.tick { stroke: var(--lav); stroke-width: 3; }
    .ink { fill: var(--ink); }
    .skin { fill: #fff; stroke: var(--ink); stroke-width: 1.4; }
    .dash { stroke: #fff; stroke-width: 1.6; stroke-linecap: round; }
    .pct { font: 800 17px var(--font); fill: var(--lav); }
    @media (max-width: 1099px) { .doodle.left { display: none; } .doodle.right { opacity: 0.35; height: 46vh; right: -60px; } }
    @media (max-width: 600px) { .doodle.right { display: none; } }
    .doodle.mini { display: none; }
    @media (max-width: 600px) { .doodle.mini { display: block; inset: 0; width: 100%; height: 100%; } }

    form {
      position: relative; z-index: 1; width: min(400px, 100%); background: var(--panel); border-radius: 28px;
      padding: 40px 36px 30px; display: grid; gap: 14px; text-align: center;
      box-shadow: 0 1px 2px rgba(44, 36, 69, 0.04), 0 30px 60px -30px rgba(44, 36, 69, 0.25);
      animation: rise 420ms var(--ease-out) both;
    }
    @media (max-width: 420px) { form { padding: 32px 22px 24px; } }
    @keyframes rise { from { opacity: 0.001; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    h1 { margin: 0; font-weight: 800; font-size: 1.75rem; letter-spacing: -0.02em; }
    .lede { margin: 0 auto 14px; max-width: 260px; color: var(--ink-2); font-size: 1rem; line-height: 1.45; }
    .field { position: relative; }
    .field input {
      width: 100%; height: 52px; padding: 0 70px 0 18px; border-radius: 12px; border: 1px solid var(--line);
      background: var(--field); color: var(--ink); font: 600 0.9375rem var(--font); text-align: left;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    .field input::placeholder { color: var(--ink-3); font-weight: 500; }
    .field input:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px rgba(214, 245, 107, 0.6); }
    .toggle {
      position: absolute; right: 8px; top: 8px; height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: none;
      font: 700 0.8125rem var(--font); color: var(--ink-2); cursor: pointer;
    }
    .toggle:hover { color: var(--ink); background: #f6f4f0; }
    .help { margin: -2px 0 6px; text-align: left; font-size: 0.8125rem; font-weight: 600; color: var(--ink-2); }
    .submit {
      appearance: none; border: 0; cursor: pointer; height: 50px; border-radius: 12px;
      background: var(--lime); color: var(--plum); font: 800 0.9375rem var(--font);
      transition: transform 120ms var(--ease-out), filter 160ms ease; -webkit-tap-highlight-color: transparent;
    }
    .submit:active { transform: scale(0.98); }
    @media (hover: hover) and (pointer: fine) { .submit:hover { filter: brightness(0.97) saturate(1.1); } }
    :is(.submit, .toggle):focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    .err { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--pink); color: var(--pink-ink); font-weight: 700; font-size: 0.875rem; text-align: left; }
    .or { display: flex; align-items: center; gap: 10px; justify-content: center; margin-top: 8px; color: var(--ink-2); font-size: 0.8125rem; font-weight: 600; }
    .or::before, .or::after { content: ""; width: 14px; height: 1px; background: var(--ink-2); }
    .chips { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    .chips span { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 0.8125rem; font-weight: 700; }
    .chips i { width: 8px; height: 8px; border-radius: 50%; }
    footer { position: relative; z-index: 1; padding: 0 16px 28px; text-align: center; font-size: 0.8125rem; font-weight: 600; color: var(--ink-2); }
    footer span { margin: 0 10px; }
    @media (prefers-reduced-motion: reduce) { form { animation: none; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <b><span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.6 3.6L17.5 8.7" /></svg></span>nerist attendance</b>
      <small>75% in every subject, theory and lab</small>
    </div>
  </header>

  <main>
    ${MINI}
    ${LEFT}
    ${RIGHT}
    <form method="post" action="/login">
      <h1>Student Login</h1>
      <p class="lede">Hey, enter your password to see your attendance.</p>
      ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
      <input type="text" name="username" value="nerist-attendance" autocomplete="username" hidden />
      <div class="field">
        <input id="pw" type="password" name="password" placeholder="Password" aria-label="Password" autocomplete="current-password" required autofocus />
        <button type="button" class="toggle" id="toggle" aria-controls="pw" aria-pressed="false">Show</button>
      </div>
      <p class="help">Stays signed in on this device for 30 days.</p>
      <button type="submit" class="submit">Sign in</button>
      <p class="or">Inside</p>
      <div class="chips" aria-hidden="true">
        <span><i style="background:#d6f56b;box-shadow:inset 0 0 0 1px #8db21f"></i>Bunk budget</span>
        <span><i style="background:#7471b8"></i>Week plan</span>
        <span><i style="background:#f8c2d8;box-shadow:inset 0 0 0 1px #8a2550"></i>Class pings</span>
      </div>
    </form>
  </main>

  <footer>NERIST Attendance<span>|</span>Only you can see this</footer>

  <script>
    const pw = document.getElementById('pw'), t = document.getElementById('toggle');
    t.addEventListener('click', () => {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      t.textContent = show ? 'Hide' : 'Show';
      t.setAttribute('aria-pressed', String(show));
      pw.focus();
    });
  </script>
</body>
</html>`;
