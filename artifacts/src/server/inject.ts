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
  const fields = () => Array.from(document.querySelectorAll('input, select, textarea, details'));
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
        if (el.tagName === 'DETAILS') state.fields[key] = { open: el.open };
        else if (el.type === 'checkbox' || el.type === 'radio') state.fields[key] = { checked: el.checked };
        else if (el.type !== 'file' && el.type !== 'password') state.fields[key] = { value: el.value };
      });
      post({ type: 'ryugi:state', state });
    }
    if (data.type === 'ryugi:restore' && data.state && data.state.fields) {
      fields().forEach((el, index) => {
        const saved = data.state.fields[keyOf(el, index)];
        if (!saved) return;
        if ('open' in saved) el.open = saved.open;
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

export function injectRuntime(html: string): string {
  const tag = `<script>${RUNTIME}</script>`;
  const match = HEAD.exec(html);
  if (!match) return tag + html;
  const at = match.index + match[0].length;
  return html.slice(0, at) + tag + html.slice(at);
}
