import { RYUGI_MARK_BODY, RYUGI_MARK_VIEWBOX } from '../shared/brand';

export const CALLBACK_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

const lucide = (body: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const CIRCLE_CHECK = lucide('<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>');
const CIRCLE_ALERT = lucide('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>');
const MARK = `<svg class="logo" width="20" height="20" viewBox="${RYUGI_MARK_VIEWBOX}" fill="currentColor" aria-hidden="true">${RYUGI_MARK_BODY}</svg>`;

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #fafaf9;
  --ink: #1d1a16;
  --soft: #6b6152;
  --faint: #a59f93;
  --rule: #e6e4de;
  --name: #c65d3b;
  --ok: #2f8a4f;
  --bad: #b4472f;
  --sans: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161514;
    --ink: #ece9e3;
    --soft: #a8a196;
    --faint: #6f6a62;
    --rule: #2c2a27;
    --name: #e08a6d;
    --ok: #6cc28a;
    --bad: #e58a72;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 72px 20px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
}
.mark {
  position: fixed;
  top: 22px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.4px;
}
main { width: min(520px, 100%); }
.status { display: flex; align-items: center; gap: 6px; margin: 0 0 14px; font-size: 12px; }
.signed-in .status { color: var(--ok); }
.failed .status { color: var(--bad); }
h1 { margin: 0 0 10px; font-size: 30px; font-weight: 650; overflow-wrap: anywhere; }
h1 em { margin-left: 8px; font-style: normal; color: var(--name); }
.lead { margin: 0; color: var(--soft); font-size: 15px; line-height: 1.8; }
.rows { margin: 32px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--rule); }
.rows li { padding: 16px 0; border-bottom: 1px solid var(--rule); font-size: 14px; }
.rows b { display: block; margin-bottom: 3px; font-weight: 600; }
.rows span { color: var(--soft); font-size: 13px; }
footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 20px; font-size: 12px; color: var(--faint); }
footer code { font: 12px var(--mono); }
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

const row = (title: string, detail: string) => `<li><b>${title}</b><span>${detail}</span></li>`;

export function callbackPage(result: SignedIn | Failed): string {
  const host = escapeHtml(new URL(result.origin).host);
  const title = result.ok ? '已登录 Ryugi Cloud' : '登录没有完成';
  const body = result.ok
    ? `<p class="status">${CIRCLE_CHECK}已连接 Ryugi Cloud</p>
      <h1>已登录<em>${escapeHtml(result.login)}</em></h1>
      <p class="lead">这台电脑上的 Ryugi 现在可以发布 artifact 了。</p>
      <ul class="rows">${row('在 Ryugi 页面里发布的？', '回到 Ryugi，分享面板会自动刷新。')}${row('让 agent 发布的？', '让它再运行一次发布命令。')}</ul>`
    : `<p class="status">${CIRCLE_ALERT}未连接</p>
      <h1>登录没有完成</h1>
      <p class="lead">${escapeHtml(result.detail)}</p>
      <ul class="rows">${row('重新登录', '回到 Ryugi，在分享面板里再点一次「登录」。')}</ul>`;
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
  <div class="mark">${MARK}ryugi</div>
  <main class="${result.ok ? 'signed-in' : 'failed'}">
    ${body}
    <footer><span>${result.ok ? '可以关闭这个页面' : '可以关闭这个页面后重试'}</span><code>${host}</code></footer>
  </main>
</body>
</html>
`;
}
