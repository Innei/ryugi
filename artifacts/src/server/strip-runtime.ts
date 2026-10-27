export const HEAD = /<head(\s[^>]*)?>/i;
export const PROLOGUE = /^\s*(<!doctype[^>]*>)?\s*(<html(\s[^>]*)?>)?/i;

export const EMBEDDED_STYLE =
  '<style>:root{color-scheme:light dark;background:transparent}body{margin:0;font-family:var(--lobe-font-family,system-ui,-apple-system,sans-serif)}</style>';

const RUNTIME_SCRIPT = /^<script>([\s\S]*?)<\/script>/;
const RUNTIME_LOADERS = /^(?:<script defer src="[^"]*\/_ryugi\/runtime\/ryugi-(?:icons|ui)\.js"><\/script>)+/;

export function injectionPoint(html: string) {
  const head = HEAD.exec(html);
  return head ? head.index + head[0].length : (PROLOGUE.exec(html)?.[0].length ?? 0);
}

export function stripRuntime(html: string) {
  const at = injectionPoint(html);
  let rest = html.slice(at);
  if (rest.startsWith(EMBEDDED_STYLE)) rest = rest.slice(EMBEDDED_STYLE.length);
  const script = RUNTIME_SCRIPT.exec(rest);
  if (!script || !script[1]!.includes('ryugi:')) return html;
  return html.slice(0, at) + rest.slice(script[0].length).replace(RUNTIME_LOADERS, '');
}
