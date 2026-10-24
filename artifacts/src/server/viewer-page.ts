import { createHash } from 'node:crypto';
import { HTML_LANG, type Locale } from '../shared/locale';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function viewerPage(template: string, page: { title: string; description: string; url: string; locale?: Locale; icon?: string; artifactId?: string }): string {
  const locale = page.locale ?? 'en';
  const values: Record<string, string> = {
    robots: 'noindex, nofollow',
    'og:locale': locale === 'zh' ? 'zh_CN' : 'en_US',
    description: page.description,
    'og:title': page.title,
    'og:description': page.description,
    'twitter:title': page.title,
    'twitter:description': page.description,
  };
  return template
    .replace(/<html\b([^>]*)>/i, (_tag, attributes: string) => `<html${attributes.replace(/\slang="[^"]*"/i, '')} lang="${HTML_LANG[locale]}"${page.artifactId ? ` data-ryugi-artifact-id="${escapeHtml(page.artifactId)}"` : ''}>`)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(page.title)}</title>`)
    .replace(/(<link\b[^>]*\brel="icon"[^>]*\bhref=")[^"]*(")/i, (tag, prefix: string, suffix: string) => (page.icon ? `${prefix}${escapeHtml(page.icon)}${suffix}` : tag))
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
