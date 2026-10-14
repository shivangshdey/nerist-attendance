// The sign-in page: same lavender canvas, white card and lime accent as the dashboard.
// Self-contained (inline CSS), so nothing from public/ is needed before you sign in.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const loginPage = (error = '') => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>NERIST Attendance</title>
  <meta name="theme-color" content="#a3a2d8" />
  <meta name="robots" content="noindex" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%232c2445'/%3E%3Cpath d='M10 16.5l4 4L22.5 12' fill='none' stroke='%23d6f56b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --canvas-a: #b1b0e0; --canvas-b: #9796cf; --glass: rgba(255, 255, 255, 0.2);
      --panel: #ffffff; --panel-2: #f5f4fb; --line: #ecebf5;
      --ink: #2c2445; --ink-2: #6f6b8c; --ink-3: #a19fbb;
      --plum: #2c2445; --lime: #d6f56b; --pink: #f8c2d8; --pink-ink: #8a2550;
      --font: "Urbanist", system-ui, -apple-system, "Segoe UI", sans-serif;
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
      color: var(--ink); background: var(--canvas-b);
      background-image: linear-gradient(115deg, var(--canvas-a) 0%, var(--canvas-b) 70%); background-attachment: fixed;
      font: 500 15px/1.4 var(--font); -webkit-font-smoothing: antialiased;
    }
    main { width: min(380px, 100%); display: grid; gap: 22px; animation: rise 380ms var(--ease-out) both; }
    @keyframes rise { from { opacity: 0.001; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .brand { display: flex; align-items: center; gap: 12px; color: #fff; justify-self: center; }
    .logo { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #fff; display: grid; place-items: center; }
    .logo svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .wordmark { font-weight: 700; font-size: 1.25rem; letter-spacing: -0.01em; }
    form { background: var(--panel); border-radius: 30px; padding: 26px 22px 22px; display: grid; gap: 14px; }
    h1 { margin: 0; font-weight: 700; font-size: 1.75rem; line-height: 1.1; letter-spacing: -0.02em; }
    p { margin: -6px 0 4px; color: var(--ink-2); font-size: 0.9375rem; }
    label { font-size: 0.8125rem; font-weight: 700; color: var(--ink-2); }
    input {
      width: 100%; height: 50px; margin-top: 6px; padding: 0 16px; border-radius: 16px; border: 1.5px solid var(--line);
      background: var(--panel-2); color: var(--ink); font: 600 1rem var(--font);
      transition: border-color 160ms ease, background-color 160ms ease;
    }
    input:focus { outline: none; border-color: var(--plum); background: #fff; }
    button {
      appearance: none; border: 0; cursor: pointer; height: 50px; border-radius: 999px; margin-top: 4px;
      background: var(--lime); color: var(--plum); font: 800 1rem var(--font);
      transition: transform 120ms var(--ease-out), filter 160ms ease; -webkit-tap-highlight-color: transparent;
    }
    button:active { transform: scale(0.98); }
    button:focus-visible { outline: 2px solid var(--plum); outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) { button:hover { filter: brightness(1.03) saturate(1.08); } }
    .err { margin: 0; padding: 10px 14px; border-radius: 14px; background: var(--pink); color: var(--pink-ink); font-weight: 700; font-size: 0.875rem; }
    @media (prefers-reduced-motion: reduce) { main { animation: none; } }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.5 12.5l3.6 3.6L17.5 8.7" /></svg></span>
      <span class="wordmark">nerist attendance</span>
    </div>
    <form method="post" action="/login">
      <h1>Can I bunk?</h1>
      <p>Only you can see this. Sign in to check.</p>
      ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
      <input type="text" name="username" value="nerist-attendance" autocomplete="username" hidden />
      <label>Password
        <input type="password" name="password" autocomplete="current-password" required autofocus />
      </label>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
