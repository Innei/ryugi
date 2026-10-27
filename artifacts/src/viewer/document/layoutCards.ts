export interface CardBox {
  id: string;
  anchorTop: number;
  height: number;
}

export function layoutCards(
  cards: CardBox[],
  gap: number,
  activeId?: string,
): Record<string, number> {
  const sorted = [...cards].sort((a, b) => a.anchorTop - b.anchorTop);
  const tops: Record<string, number> = {};
  const pivot = activeId ? sorted.findIndex((card) => card.id === activeId) : -1;
  const start = Math.max(pivot, 0);

  let floor = -Infinity;
  for (let i = start; i < sorted.length; i++) {
    const card = sorted[i]!;
    const top = Math.max(card.anchorTop, floor);
    tops[card.id] = top;
    floor = top + card.height + gap;
  }

  if (pivot > 0) {
    let ceiling = tops[sorted[pivot]!.id]!;
    for (let i = pivot - 1; i >= 0; i--) {
      const card = sorted[i]!;
      const top = Math.min(card.anchorTop, ceiling - gap - card.height);
      tops[card.id] = top;
      ceiling = top;
    }
  }
  return tops;
}

export function connectorPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bend: number,
): string {
  const start = Math.max(from.x, to.x - bend);
  const mid = (start + to.x) / 2;
  const run = start > from.x ? ` H${start}` : '';
  return `M${from.x} ${from.y}${run} C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const BAR_GAP = 8;
const BAR_WIDTH = 3;
const BAR_LINK_Y = 18;

export function blockBar(block: Pick<Box, 'top' | 'right' | 'bottom'>): Box {
  const left = block.right + BAR_GAP;
  return { left, right: left + BAR_WIDTH, top: block.top, bottom: block.bottom };
}

export function barLinkStart(bar: Box): { x: number; y: number } {
  return { x: bar.right, y: bar.top + Math.min(BAR_LINK_Y, (bar.bottom - bar.top) / 2) };
}

export function popoverPosition(
  selection: { left: number; bottom: number },
  bounds: { left: number; right: number },
  width: number,
  gap: number,
): { left: number; top: number } {
  const left = Math.max(bounds.left, Math.min(selection.left, bounds.right - width));
  return { left, top: selection.bottom + gap };
}

export function toolbarPosition(
  selection: { left: number; top: number },
  bounds: { left: number; right: number },
  width: number,
  height: number,
  gap: number,
): { left: number; top: number } {
  const left = Math.max(bounds.left, Math.min(selection.left, bounds.right - width));
  return { left, top: selection.top - height - gap };
}

const MENU_GAP = 10;

export function editMenuPosition(
  selection: { left: number; top: number; bottom: number },
  bounds: { left: number; right: number },
  width: number,
  height: number,
  viewport: { top: number; height: number; reserved: number },
): { left: number; top: number; placement: 'below' | 'above' } {
  const left = Math.max(bounds.left, Math.min(selection.left, bounds.right - width));
  const below = selection.bottom + MENU_GAP;
  if (viewport.top + below + height <= viewport.height - viewport.reserved - 8)
    return { left, top: below, placement: 'below' };
  return { left, top: selection.top - height - MENU_GAP, placement: 'above' };
}
