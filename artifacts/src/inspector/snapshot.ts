export function installSnapshot(win: Window & typeof globalThis, serialize: typeof serializeBoard) {
  const doc = win.document;
  const post = (type: string, data: Record<string, unknown> = {}) =>
    win.parent.postMessage({ type: `ryugi:board:${type}`, ...data }, '*');
  const frame = () => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
  const settle = async () => {
    try {
      await doc.fonts?.ready;
    } catch {
      void 0;
    }
    for (let round = 0; round < 20; round++) {
      const running = (doc.getAnimations?.() ?? []).filter(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getComputedTiming().endTime !== Infinity,
      );
      if (!running.length) break;
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
    await frame();
    await frame();
    post('ready');
  };
  if (doc.readyState === 'complete') void settle();
  else win.addEventListener('load', () => void settle(), { once: true });
  const interacted = () => post('interacted');
  win.addEventListener('pointerdown', interacted, true);
  win.addEventListener('keydown', interacted, true);

  const own = (node: Node | null) =>
    !!node &&
    (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest?.(
      '[data-ryugi-inspector]',
    ) != null;
  let changed = 0;
  const observer = new win.MutationObserver((records) => {
    if (
      records.every(
        (record) => own(record.target) || [...record.addedNodes, ...record.removedNodes].some(own),
      )
    )
      return;
    win.clearTimeout(changed);
    changed = win.setTimeout(() => post('changed'), 500);
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });

  const rasterize = async (svg: string, width: number, height: number, scale: number) => {
    const image = new win.Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = new win.OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
    const context = canvas.getContext('2d')!;
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/png' });
  };
  win.addEventListener('message', async (event) => {
    const data = event.data;
    if (
      event.source !== win.parent ||
      data?.type !== 'ryugi:board:capture' ||
      !Number.isSafeInteger(data.request) ||
      !(data.scale > 0 && data.scale <= 4)
    )
      return;
    try {
      const { svg, width, height } = await serialize(win);
      const blob = await rasterize(svg, width, height, data.scale);
      post('snapshot', { request: data.request, blob, width, height });
    } catch (error) {
      post('snapshot', {
        request: data.request,
        error: String((error as Error)?.message ?? error).slice(0, 200),
      });
    }
  });
}

export async function serializeBoard(
  win: Window & typeof globalThis,
): Promise<{ svg: string; width: number; height: number }> {
  const doc = win.document;
  const unsupported = (reason: string) => new Error(`unsupported: ${reason}`);
  const blocked = doc.querySelector('video, audio, iframe, object, embed');
  if (blocked) throw unsupported(blocked.tagName.toLowerCase());
  const dataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new win.FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  const files = new Map<string, Promise<Response>>();
  const load = (url: string) => {
    if (!files.has(url))
      files.set(
        url,
        win.fetch(url).then((response) => {
          if (!response.ok) throw unsupported(`fetch ${url.slice(0, 120)}`);
          return response;
        }),
      );
    return files.get(url)!.then((response) => response.clone());
  };
  const inline = async (url: string) => dataUrl(await (await load(url)).blob());
  const CSS_URL = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/g;
  const IMPORT = /@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1\s*\)?[^;]*;/g;
  const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
  const faceKey = (family: string, weight: string, style: string, range: string) =>
    [
      family.replace(/["']/g, '').trim().toLowerCase(),
      ({ normal: '400', bold: '700' } as Record<string, string>)[weight.trim()] ?? weight.trim(),
      style.trim() || 'normal',
      range.replace(/\s/g, '').toLowerCase(),
    ].join('|');
  const faces = new Map<string, boolean>();
  for (const face of (doc.fonts ?? []) as Iterable<FontFace>) {
    const key = faceKey(face.family, face.weight, face.style, face.unicodeRange);
    faces.set(key, faces.get(key) === true || face.status === 'loaded');
  }
  const descriptor = (block: string, name: string, fallback: string) =>
    new RegExp(`${name}\\s*:\\s*([^;}]+)`).exec(block)?.[1] ?? fallback;
  const unloaded = (block: string) =>
    faces.get(
      faceKey(
        descriptor(block, 'font-family', ''),
        descriptor(block, 'font-weight', '400'),
        descriptor(block, 'font-style', 'normal'),
        descriptor(block, 'unicode-range', 'U+0-10FFFF'),
      ),
    ) === false;
  const inlineCss = async (css: string, base: string, depth = 0): Promise<string> => {
    let text = css;
    for (const match of [...text.matchAll(IMPORT)]) {
      const href = new URL(match[2]!, base).href;
      text = text.replace(
        match[0],
        depth < 3 ? await inlineCss(await (await load(href)).text(), href, depth + 1) : '',
      );
    }
    text = text.replace(FONT_FACE, (block) => (unloaded(block) ? '' : block));
    const urls = [
      ...new Set(
        [...text.matchAll(CSS_URL)]
          .map((match) => match[2]!)
          .filter((url) => !/^(?:data:|#|about:)/.test(url)),
      ),
    ];
    const inlined = await Promise.all(urls.map((url) => inline(new URL(url, base).href)));
    return text
      .replace(CSS_URL, (whole, _quote, url: string) =>
        urls.includes(url) ? `url("${inlined[urls.indexOf(url)]}")` : whole,
      )
      .replace(/:root\b/g, 'html');
  };
  const root = doc.documentElement;
  const clone = root.cloneNode(true) as HTMLElement;
  const source = [root, ...root.querySelectorAll('*')];
  const target = [clone, ...clone.querySelectorAll('*')];
  const jobs: Promise<void>[] = [];
  for (let index = 0; index < source.length; index++) {
    const from = source[index]!,
      to = target[index] as HTMLElement;
    if (from.hasAttribute('data-ryugi-inspector')) continue;
    if (from.shadowRoot) {
      const style = win.getComputedStyle(from);
      to.style.display = style.display;
      to.style.verticalAlign = style.verticalAlign;
      to.style.flex = style.flex;
      to.innerHTML = from.shadowRoot.innerHTML.replace(/<style[\s\S]*?<\/style>/g, '');
      const svg = to.querySelector('svg');
      if (svg) {
        svg.style.display = 'block';
        svg.style.width = '100%';
        svg.style.height = '100%';
      }
    }
    if (from instanceof win.HTMLImageElement) {
      to.removeAttribute('srcset');
      to.removeAttribute('sizes');
      const src = from.currentSrc || from.src;
      if (src && !src.startsWith('data:'))
        jobs.push(
          inline(new URL(src, doc.baseURI).href).then((url) => to.setAttribute('src', url)),
        );
    } else if (from instanceof win.HTMLCanvasElement) {
      if (!from.getContext('2d')) throw unsupported('webgl canvas');
      let url = '';
      try {
        url = from.toDataURL();
      } catch {
        throw unsupported('tainted canvas');
      }
      const image = doc.createElement('img');
      image.src = url;
      image.setAttribute('style', from.getAttribute('style') ?? '');
      image.width = from.width;
      image.height = from.height;
      to.replaceWith(image);
    } else if (from instanceof win.HTMLInputElement) {
      to.setAttribute('value', from.value);
      if (from.checked) to.setAttribute('checked', '');
      else to.removeAttribute('checked');
    } else if (from instanceof win.HTMLTextAreaElement) {
      to.textContent = from.value;
    } else if (from instanceof win.HTMLSelectElement) {
      to.querySelectorAll('option').forEach((option, at) =>
        at === from.selectedIndex
          ? option.setAttribute('selected', '')
          : option.removeAttribute('selected'),
      );
    } else if (
      from instanceof win.HTMLLinkElement &&
      /\bstylesheet\b/i.test(from.rel) &&
      from.href
    ) {
      const href = new URL(from.href, doc.baseURI).href;
      jobs.push(
        load(href)
          .then((response) => response.text())
          .then((css) => inlineCss(css, href))
          .then((css) => {
            const style = doc.createElement('style');
            style.textContent = css;
            to.replaceWith(style);
          }),
      );
    } else if (from instanceof win.HTMLStyleElement) {
      jobs.push(
        inlineCss(from.textContent ?? '', doc.baseURI).then((css) => {
          to.textContent = css;
        }),
      );
    }
    const inlineStyle = from.getAttribute('style');
    if (inlineStyle?.includes('url('))
      jobs.push(inlineCss(inlineStyle, doc.baseURI).then((css) => to.setAttribute('style', css)));
  }
  await Promise.all(jobs);
  for (const element of clone.querySelectorAll('script, noscript, link, [data-ryugi-inspector]'))
    element.remove();
  /* An SVG image never runs its animations, so each would show its first keyframe; jump them to their end instead. */
  const settled = doc.createElement('style');
  settled.textContent =
    '*, *::before, *::after { animation-delay: -99999s !important; animation-play-state: paused !important; transition: none !important }';
  clone.append(settled);
  const width = win.innerWidth,
    height = win.innerHeight;
  const xhtml = new win.XMLSerializer().serializeToString(clone);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`,
    width,
    height,
  };
}
