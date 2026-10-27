import type { TweakSchema, tweakTools, TweakValues } from '../shared/tweaks';

export function installTweaks(win: Window & typeof globalThis, makeTools: typeof tweakTools) {
  if (Object.getOwnPropertyDescriptor(win, 'ryugiTweaks')) return;
  const { readTweakSchema, readTweakValues, reconcileTweakValues } = makeTools();
  const doc = win.document;
  const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let connection = '';
  let source: string | null | undefined;
  let declarationCount = -1;
  let schema: TweakSchema | null = null;
  let error: string | null = null;
  let values: TweakValues = {};

  function apply(next: TweakValues, emit: boolean) {
    for (const key of Object.keys(values)) {
      if (!(key in next)) {
        doc.documentElement.style.removeProperty(`--tweak-${key}`);
        doc.documentElement.removeAttribute(`data-tweak-${key}`);
      }
    }
    values = next;
    for (const [key, value] of Object.entries(next)) {
      doc.documentElement.style.setProperty(`--tweak-${key}`, String(value));
      doc.documentElement.setAttribute(`data-tweak-${key}`, String(value));
    }
    if (emit) doc.dispatchEvent(new win.CustomEvent('ryugi-tweaks', { detail: { ...values } }));
  }

  function read() {
    const scripts = doc.querySelectorAll('script[type="application/json"][data-ryugi-tweaks]');
    const next = scripts.length ? scripts[0]!.textContent : null;
    if (next === source && scripts.length === declarationCount) return;
    source = next;
    declarationCount = scripts.length;
    try {
      if (scripts.length > 1) throw new Error('Use one data-ryugi-tweaks declaration per board.');
      if (next && next.length > 65536) throw new Error('Parameter declaration is too large.');
      const result = readTweakSchema(next === null ? null : JSON.parse(next));
      schema = result.schema;
      error = result.error;
    } catch (cause) {
      schema = null;
      error =
        cause instanceof SyntaxError ? 'Invalid parameter JSON.' : String((cause as Error).message);
    }
    apply(schema ? reconcileTweakValues(schema) : {}, false);
  }

  const report = () =>
    win.parent.postMessage(
      { type: 'ryugi:tweaks:ready', connection, session, schema, error, values: { ...values } },
      '*',
    );
  Object.defineProperty(win, 'ryugiTweaks', {
    get: () => {
      read();
      return { ...values };
    },
  });
  doc.addEventListener(
    'DOMContentLoaded',
    () => {
      read();
      if (connection) report();
    },
    { once: true },
  );
  win.addEventListener('message', (event) => {
    if (event.source !== win.parent) return;
    const data = event.data;
    if (!data || data.type !== 'ryugi:tweaks') return;
    if (
      data.action === 'connect' &&
      typeof data.connection === 'string' &&
      data.connection.length > 0 &&
      data.connection.length <= 128
    ) {
      connection = data.connection;
      read();
      report();
    } else if (
      data.action === 'set' &&
      data.connection === connection &&
      data.session === session &&
      connection &&
      schema
    ) {
      const next = readTweakValues(schema, data.values);
      if (next && Object.keys(next).some((key) => next[key] !== values[key])) apply(next, true);
    }
  });
}
