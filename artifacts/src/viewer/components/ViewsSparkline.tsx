const WIDTH = 240;
const HEIGHT = 28;

export function ViewsSparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0;
  const points = values.map((value, i) => `${(i * step).toFixed(1)},${(HEIGHT - 2 - (value / max) * (HEIGHT - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="cloud-sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
