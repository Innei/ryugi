export interface CardBox {
  id: string;
  anchorTop: number;
  height: number;
}

export function layoutCards(cards: CardBox[], gap: number, activeId?: string): Record<string, number> {
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

export function connectorPath(from: { x: number; y: number }, to: { x: number; y: number }, bend: number): string {
  const elbow = to.x - bend;
  return from.x < elbow ? `M${from.x} ${from.y} H${elbow} L${to.x} ${to.y}` : `M${from.x} ${from.y} L${to.x} ${to.y}`;
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
