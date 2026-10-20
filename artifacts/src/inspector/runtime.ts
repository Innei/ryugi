import type { InspectorNode, InspectorProperty, InspectorRect, InspectorSelection, LayerKind } from '../shared/inspector';

// Self-contained: the server serializes this function into sandboxed artboard HTML.
export function installInspector(win: Window & typeof globalThis, properties: readonly string[]) {
  const doc = win.document;
  const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const ids = new WeakMap<Element, number>();
  const elements = new Map<number, Element>();
  const originals = new Map<HTMLElement | SVGElement, Map<string, { value: string; priority: string; applied: string }>>();
  const ignored = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'NOSCRIPT', 'HEAD']);
  let nextId = 0;
  let enabled = false;
  let connection = '';
  let selected: Element | null = null;
  let treeTimer = 0;
  let hoverFrame = 0;
  let dragging: { x: number; y: number; pointer: number } | null = null;
  const post = (type: string, data: Record<string, unknown>) => win.parent.postMessage({ type: `ryugi:inspect:${type}`, session, connection, ...data }, '*');
  const idOf = (el: Element) => {
    let id = ids.get(el);
    if (!id) { id = ++nextId; ids.set(el, id); }
    elements.set(id, el);
    return id;
  };
  const label = (el: Element) => (el.getAttribute('data-layer-name') || el.getAttribute('aria-label') || el.id || (!el.childElementCount ? el.textContent?.trim() : '') || '').slice(0, 100);
  const selector = (el: Element) => (el.id ? `#${el.id}` : el.tagName.toLowerCase() + Array.from(el.classList).slice(0, 2).map((name) => `.${name}`).join('')).slice(0, 200);
  const kind = (el: Element, style: CSSStyleDeclaration): LayerKind => {
    if (/^H[1-6]$/.test(el.tagName)) return 'Title';
    if (['IMG', 'SVG', 'CANVAS', 'VIDEO'].includes(el.tagName.toUpperCase())) return 'Image';
    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return 'Button';
    if (!el.childElementCount) return 'Text';
    if (style.display.includes('flex')) return style.flexDirection.startsWith('row') ? 'Row' : 'Column';
    return style.display.includes('grid') ? 'Grid' : 'Frame';
  };
  const rectOf = (el: Element): InspectorRect => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };
  const selection = (reason: 'user' | 'command' | 'update') => {
    if (!selected?.isConnected) { selected = null; post('selection', { selection: null, reason }); return; }
    const el = selected;
    const style = win.getComputedStyle(el);
    const inline = (el as HTMLElement).style;
    const info: InspectorSelection = {
      id: idOf(el), name: label(el), tag: el.tagName.toLowerCase(), selector: selector(el), rect: rectOf(el),
      css: Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])) as InspectorSelection['css'],
      html: el.outerHTML.slice(0, 20000),
      widthMode: inline?.width === '100%' ? 'fill' : inline?.width === 'max-content' ? 'hug' : 'fixed',
      heightMode: inline?.height && inline.height !== 'auto' ? 'fixed' : 'hug',
    };
    post('selection', { selection: info, reason });
  };
  const tweaks = () => {
    const list = [];
    for (const [el, changes] of originals) {
      if (!el.isConnected) { originals.delete(el); continue; }
      for (const [property, saved] of changes) list.push({ id: idOf(el), name: label(el) || selector(el), property, value: saved.applied });
    }
    post('tweaks', { tweaks: list });
  };
  const tree = () => {
    if (!enabled || !doc.body) return;
    elements.clear();
    const nodes: InspectorNode[] = [];
    let truncated = false;
    const visit = (el: Element, parentId: number | null, depth: number): number | null => {
      if (ignored.has(el.tagName) || el.hasAttribute('data-ryugi-inspector')) return null;
      if (nodes.length >= 2500 || depth >= 50) { truncated = true; return null; }
      const id = idOf(el);
      const node: InspectorNode = { id, parentId, name: label(el), tag: el.tagName.toLowerCase(), selector: selector(el), kind: kind(el, win.getComputedStyle(el)), children: [] };
      nodes.push(node);
      for (const child of el.children) {
        if (nodes.length >= 2500) { truncated = true; break; }
        const childId = visit(child, id, depth + 1);
        if (childId !== null) node.children.push(childId);
      }
      return id;
    };
    visit(doc.body, null, 0);
    post('tree', { nodes, truncated });
  };
  const refresh = () => {
    treeTimer = 0;
    if (!enabled) return;
    tree(); selection('update'); tweaks();
  };
  const schedule = () => { if (enabled && !treeTimer) treeTimer = win.setTimeout(refresh, 100); };
  const observer = new win.MutationObserver(schedule);
  const resize = new win.ResizeObserver(() => { if (enabled && selected) selection('update'); });
  const ignoredTarget = (el: Element) => !!el.closest('[data-ryugi-inspector], script, style, link');
  const onClick = (event: MouseEvent) => {
    if (!enabled || event.button !== 0 || !(event.target instanceof win.Element) || ignoredTarget(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    selected = event.target.closest('svg') || event.target;
    selection('user');
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!enabled) return;
    if (event.button === 1) {
      event.preventDefault(); event.stopImmediatePropagation();
      dragging = { x: event.screenX, y: event.screenY, pointer: event.pointerId };
      doc.documentElement.setPointerCapture?.(event.pointerId);
    } else if (event.button === 0) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!enabled) return;
    if (dragging) {
      post('pan', { deltaX: event.screenX - dragging.x, deltaY: event.screenY - dragging.y });
      dragging.x = event.screenX; dragging.y = event.screenY;
      return;
    }
    if (hoverFrame || !(event.target instanceof win.Element)) return;
    const el = event.target.closest('svg') || event.target;
    hoverFrame = win.requestAnimationFrame(() => { hoverFrame = 0; if (enabled && el.isConnected) post('hover', { rect: rectOf(el) }); });
  };
  const endDrag = () => { dragging = null; };
  const leave = () => { if (enabled) post('hover', { rect: null }); };
  const wheel = (event: WheelEvent) => {
    if (!enabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? win.innerHeight : 1;
    post('wheel', { deltaX: event.deltaX * factor, deltaY: event.deltaY * factor, x: event.clientX, y: event.clientY, zoom: event.ctrlKey || event.metaKey });
  };
  const key = (event: KeyboardEvent) => {
    if (!enabled || event.composedPath().some((target) => target instanceof win.Element && target.matches('input,textarea,select,[contenteditable]'))) return;
    if (!['Space', 'KeyH', 'KeyV', 'Escape', 'Equal', 'Minus', 'Digit0', 'Digit1'].includes(event.code)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    post('key', { key: event.key, code: event.code, down: event.type === 'keydown', ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey });
  };
  const scroll = () => { if (enabled && selected) selection('update'); };
  const disable = () => {
    enabled = false; dragging = null;
    observer.disconnect(); resize.disconnect();
    win.clearTimeout(treeTimer); win.cancelAnimationFrame(hoverFrame);
    treeTimer = 0; hoverFrame = 0;
    post('hover', { rect: null });
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== win.parent || event.data?.type !== 'ryugi:inspect') return;
    const data = event.data;
    if (data.action === 'enable') {
      if (typeof data.connection !== 'string' || !data.connection || data.connection.length > 128) return;
      connection = data.connection;
      enabled = true;
      observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
      resize.observe(doc.documentElement);
      tree(); tweaks();
      if (selected) selection('command');
      return;
    }
    if (data.connection !== connection) return;
    if (data.action === 'disable') { disable(); return; }
    if (!enabled && data.action !== 'reset') return;
    if (data.session !== session) return;
    if (data.action === 'select' && Number.isSafeInteger(data.id)) {
      const el = elements.get(data.id);
      if (el?.isConnected) { selected = el; selection('command'); }
    } else if (data.action === 'hover') {
      const el = elements.get(data.id);
      post('hover', { rect: el?.isConnected ? rectOf(el) : null });
    } else if (data.action === 'style' && data.session === session && selected && ids.get(selected) === data.id && properties.includes(data.property) && typeof data.value === 'string' && data.value.length <= 300) {
      const el = selected as HTMLElement | SVGElement;
      if (!el.style || !el.isConnected) return;
      const property = data.property as InspectorProperty;
      const probe = doc.createElement('div').style;
      probe.setProperty(property, data.value);
      const value = probe.getPropertyValue(property);
      if (!value) return;
      if (!originals.has(el)) originals.set(el, new Map());
      const changes = originals.get(el)!;
      if (!changes.has(property)) changes.set(property, { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property), applied: '' });
      el.style.setProperty(property, value);
      changes.get(property)!.applied = el.style.getPropertyValue(property);
      selection('update'); tweaks();
    } else if (data.action === 'reset') {
      for (const [el, changes] of originals) for (const [property, saved] of changes) {
        if (el.style.getPropertyValue(property) !== saved.applied || el.style.getPropertyPriority(property)) continue;
        if (saved.value) el.style.setProperty(property, saved.value, saved.priority); else el.style.removeProperty(property);
      }
      originals.clear(); selection('update'); tweaks();
    }
  };
  win.addEventListener('message', onMessage);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointermove', onPointerMove, true);
  doc.addEventListener('pointerup', endDrag, true);
  doc.addEventListener('pointercancel', endDrag, true);
  doc.addEventListener('pointerleave', leave);
  doc.addEventListener('wheel', wheel, { passive: false, capture: true });
  doc.addEventListener('keydown', key, true);
  doc.addEventListener('keyup', key, true);
  win.addEventListener('scroll', scroll, true);
  win.addEventListener('blur', endDrag);
  return () => {
    disable();
    win.removeEventListener('message', onMessage);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', endDrag, true);
    doc.removeEventListener('pointercancel', endDrag, true);
    doc.removeEventListener('pointerleave', leave);
    doc.removeEventListener('wheel', wheel, true);
    doc.removeEventListener('keydown', key, true);
    doc.removeEventListener('keyup', key, true);
    win.removeEventListener('scroll', scroll, true);
    win.removeEventListener('blur', endDrag);
  };
}
