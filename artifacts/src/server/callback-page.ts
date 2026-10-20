export const CALLBACK_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const GRAIN =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>";

const STYLE = `
:root {
  color-scheme: light dark;
  --paper: #f3ede1;
  --paper-deep: #e8dfcd;
  --ink: #1d1a16;
  --ink-soft: #6b6152;
  --rule: #cfc3ab;
  --moon-hi: #fffaf0;
  --moon-mid: #f1e4c6;
  --moon-lo: #d6c19b;
  --halo: rgba(214, 178, 110, 0.35);
  --accent: #9b3d2a;
  --serif: "Iowan Old Style", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif;
  --sans: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0e1222;
    --paper-deep: #070912;
    --ink: #ece6d8;
    --ink-soft: #9a96a8;
    --rule: #2a3050;
    --moon-hi: #fffdf6;
    --moon-mid: #e9dfc6;
    --moon-lo: #b9a985;
    --halo: rgba(233, 214, 160, 0.28);
    --accent: #e08a6d;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background: radial-gradient(120% 90% at 18% 20%, var(--paper) 0%, var(--paper-deep) 100%);
  color: var(--ink);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("${GRAIN}");
  opacity: 0.07;
  mix-blend-mode: multiply;
  pointer-events: none;
}
main {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 360px);
  align-items: center;
  gap: 56px;
  max-width: 760px;
}
.sky { position: relative; width: 220px; height: 220px; }
.moon {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 64% 30%, rgba(0, 0, 0, 0.06) 0 9%, transparent 10%),
    radial-gradient(circle at 34% 62%, rgba(0, 0, 0, 0.05) 0 13%, transparent 14%),
    radial-gradient(circle at 70% 70%, rgba(0, 0, 0, 0.04) 0 6%, transparent 7%),
    radial-gradient(circle at 35% 32%, var(--moon-hi) 0%, var(--moon-mid) 55%, var(--moon-lo) 100%);
  box-shadow: 0 0 0 1px var(--halo), 0 0 80px 18px var(--halo);
  animation: rise 1.1s cubic-bezier(0.2, 0.7, 0.1, 1) both;
}
.failed .moon {
  background: transparent;
  box-shadow: inset 34px -14px 0 0 var(--moon-lo), 0 0 0 1px var(--rule);
  opacity: 0.85;
}
.vertical {
  position: absolute;
  right: -34px;
  top: 6px;
  writing-mode: vertical-rl;
  font-family: var(--serif);
  font-size: 15px;
  letter-spacing: 0.5em;
  color: var(--ink-soft);
  animation: fade 1s 0.5s both;
}
.label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft);
  animation: fade 0.8s 0.35s both;
}
.label::before { content: ""; width: 28px; height: 1px; background: var(--rule); }
.failed .label { color: var(--accent); }
h1 {
  margin: 0;
  font-family: var(--serif);
  font-weight: 600;
  font-size: clamp(34px, 6vw, 46px);
  line-height: 1.15;
  letter-spacing: 0.01em;
  animation: fade 0.9s 0.45s both;
}
h1 em {
  display: block;
  font-style: italic;
  font-weight: 400;
  color: var(--ink-soft);
}
p {
  margin: 22px 0 0;
  font-size: 15px;
  line-height: 1.85;
  color: var(--ink-soft);
  animation: fade 0.9s 0.6s both;
}
p strong { color: var(--ink); font-weight: 500; }
footer {
  margin-top: 34px;
  padding-top: 16px;
  border-top: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-soft);
  animation: fade 0.9s 0.75s both;
}
@keyframes rise { from { opacity: 0; transform: translateY(28px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (max-width: 640px) {
  main { grid-template-columns: 1fr; gap: 40px; justify-items: start; }
  .sky { width: 132px; height: 132px; }
  .vertical { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; }
}
`;

interface SignedIn {
  ok: true;
  login: string;
  origin: string;
}

interface Failed {
  ok: false;
  detail: string;
  origin: string;
}

export function callbackPage(result: SignedIn | Failed): string {
  const host = escapeHtml(new URL(result.origin).host);
  const title = result.ok ? '已登录 Ryugi Cloud' : '登录没有完成';
  const body = result.ok
    ? `<p class="label">Ryugi Cloud · 已连接</p>
      <h1>已登录<em>${escapeHtml(result.login)}</em></h1>
      <p>这台电脑上的 Ryugi 现在可以发布 artifact 了。<strong>回到 Ryugi</strong>，分享面板会自动刷新；如果是让 agent 发布的，让它再运行一次发布命令。</p>`
    : `<p class="label">Ryugi Cloud · 未连接</p>
      <h1>登录没有完成</h1>
      <p>${escapeHtml(result.detail)}</p>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Ryugi Cloud 本地登录结果。完成连接后，返回 Ryugi 继续发布和分享 Artifact。">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
  <main class="${result.ok ? 'signed-in' : 'failed'}">
    <div class="sky" aria-hidden="true"><div class="moon"></div><span class="vertical">流儀</span></div>
    <section>
      ${body}
      <footer><span>${result.ok ? '可以关闭这个页面' : '可以关闭这个页面后重试'}</span><span>${host}</span></footer>
    </section>
  </main>
</body>
</html>
`;
}
