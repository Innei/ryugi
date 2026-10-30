export interface BoardLabelMetrics {
  actions: number;
  id: number;
  title: number;
}

export function boardLabelLayout(metrics: BoardLabelMetrics, screenWidth: number, scale: number) {
  const width = screenWidth / scale;
  const required = metrics.title + metrics.actions + (metrics.actions ? 8 : 0);
  const stacked = required > width;
  return { stacked, showId: !stacked && required + metrics.id + 6 <= width };
}
