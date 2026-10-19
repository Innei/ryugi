const RUNTIME = `(() => {
  const post = (message) => parent.postMessage(message, '*');
  addEventListener('error', (event) => {
    const el = event.target;
    if (el && el !== window && el.getAttribute) {
      post({ type: 'ryugi:error', message: 'failed to load ' + (el.getAttribute('src') || el.getAttribute('href') || el.tagName) });
      return;
    }
    const where = event.filename ? ' (' + event.filename.split('/').pop().split('?')[0] + ':' + event.lineno + ')' : '';
    post({ type: 'ryugi:error', message: String(event.message || 'error') + where });
  }, true);
  addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    post({ type: 'ryugi:error', message: 'unhandled rejection: ' + String((reason && reason.message) || reason) });
  });
  const fields = () =>
    Array.from(document.querySelectorAll('input, select, textarea, details, [data-ryugi-control]')).filter(
      (el) => el.hasAttribute('data-ryugi-control') || !el.closest('[data-ryugi-control]'),
    );
  const keyOf = (el, index) => {
    if (el.id) return '#' + el.id;
    if (el.type === 'radio') return 'radio:' + el.name + ':' + el.value;
    if (el.name) return el.tagName + ':' + el.name;
    return el.tagName + ':' + index;
  };
  const fire = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const data = event.data || {};
    if (data.type === 'ryugi:snapshot') {
      const state = { scroll: [scrollX, scrollY], fields: {} };
      fields().forEach((el, index) => {
        const key = keyOf(el, index);
        if (el.hasAttribute('data-ryugi-control')) {
          const saved = {};
          if ('value' in el && el.value !== undefined) saved.value = el.value;
          if (typeof el.checked === 'boolean') saved.checked = el.checked;
          state.fields[key] = saved;
        } else if (el.tagName === 'DETAILS') state.fields[key] = { open: el.open };
        else if (el.type === 'checkbox' || el.type === 'radio') state.fields[key] = { checked: el.checked };
        else if (el.type !== 'file' && el.type !== 'password') state.fields[key] = { value: el.value };
      });
      post({ type: 'ryugi:state', state });
    }
    if (data.type === 'ryugi:restore' && data.state && data.state.fields) {
      fields().forEach((el, index) => {
        const saved = data.state.fields[keyOf(el, index)];
        if (!saved) return;
        if (el.hasAttribute('data-ryugi-control')) {
          let changed = false;
          if ('value' in saved && el.value !== saved.value) {
            el.value = saved.value;
            changed = true;
          }
          if ('checked' in saved && el.checked !== saved.checked) {
            el.checked = saved.checked;
            changed = true;
          }
          if (changed) {
            el.dispatchEvent(new CustomEvent('ryugi-change', { bubbles: true, detail: { value: el.value, checked: el.checked } }));
          }
        } else if ('open' in saved) el.open = saved.open;
        else if ('checked' in saved) {
          if (el.checked !== saved.checked) {
            el.checked = saved.checked;
            fire(el);
          }
        } else if ('value' in saved && el.value !== saved.value) {
          el.value = saved.value;
          fire(el);
        }
      });
      const scroll = data.state.scroll || [0, 0];
      scrollTo(scroll[0], scroll[1]);
    }
  });
})();`;

const HEAD = /<head(\s[^>]*)?>/i;
const PROLOGUE = /^\s*(<!doctype[^>]*>)?\s*(<html(\s[^>]*)?>)?/i;

// One line, so error line numbers the page reports match the agent's file.
const RUNTIME_LINE = RUNTIME.split('\n')
  .map((line) => line.trim())
  .join(' ');

const UI_MARKER = /<ryugi-[a-z0-9-]+(?:\s|>)/i;
const UI_META = /<meta[^>]+name=["']ryugi-ui["'][^>]*>/i;

export function injectRuntime(html: string, options: { uiRuntimeUrl?: string } = {}): string {
  const tag = `<script>${RUNTIME_LINE}</script>`;
  const ui =
    options.uiRuntimeUrl && (UI_MARKER.test(html) || UI_META.test(html))
      ? `<script defer src="${options.uiRuntimeUrl.replace(/"/g, '&quot;')}"></script>`
      : '';
  const head = HEAD.exec(html);
  const at = head ? head.index + head[0].length : (PROLOGUE.exec(html)?.[0].length ?? 0);
  return html.slice(0, at) + tag + ui + html.slice(at);
}
