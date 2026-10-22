import { createHash } from 'node:crypto';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function viewerPage(template: string, page: { title: string; description: string; url: string }): string {
  const values: Record<string, string> = {
    robots: 'noindex, nofollow',
    description: page.description,
    'og:title': page.title,
    'og:description': page.description,
    'twitter:title': page.title,
    'twitter:description': page.description,
  };
  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(page.title)}</title>`)
    .replace(/(<meta\b[^>]*\b(?:name|property)="([^"]+)"[^>]*\bcontent=")([^"]*)("[^>]*>)/gi, (tag, prefix: string, name: string, value: string, suffix: string) => {
      const content = values[name] ?? (name === 'og:image' || name === 'twitter:image' ? new URL(value, page.url).href : undefined);
      return content === undefined ? tag : `${prefix}${escapeHtml(content)}${suffix}`;
    })
    .replace(/<\/head>/i, () => `<link rel="canonical" href="${escapeHtml(page.url)}">\n<meta property="og:url" content="${escapeHtml(page.url)}">\n</head>`);
}

const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

export function allowInlineScripts(csp: string, html: string): string {
  const hashes = [...html.matchAll(INLINE_SCRIPT)].map(([, body]) => `'sha256-${createHash('sha256').update(body!).digest('base64')}'`);
  return hashes.length ? csp.replace(/script-src [^;]*/, (directive) => `${directive} ${hashes.join(' ')}`) : csp;
}
