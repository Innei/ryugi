export type AttributeKind = 'boolean' | 'number' | 'string';

export function readAttribute(el: Element, name: string, kind: AttributeKind): unknown {
  const raw = el.getAttribute(name);
  if (raw === null) return undefined;
  if (kind === 'boolean') return raw !== 'false';
  if (kind === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  return raw;
}

export function styleObject(el: HTMLElement): Record<string, string> | undefined {
  if (el.style.length === 0) return undefined;
  const style: Record<string, string> = {};
  for (const property of Array.from(el.style)) {
    const key = property.startsWith('--')
      ? property
      : property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    style[key] = el.style.getPropertyValue(property);
  }
  return style;
}
