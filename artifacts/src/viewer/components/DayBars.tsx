import { useState } from 'react';
import { i18n } from '../i18n';

const HEIGHT = 120;
const GAP = 3;

interface Props {
  days: { day: string; value: number }[];
  label: string;
  unit: (count: number) => string;
  tone?: 'accent' | 'muted';
  height?: number;
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function DayBars({ days, label, unit, tone = 'accent', height = HEIGHT }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((day) => day.value));
  const width = days.length * 20;
  const bar = 20 - GAP;
  const shown = hover === null ? null : days[hover];
  return (
    <div className={`cloud-daybars is-${tone}`} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label={`${label}: ${days.map((day) => `${dayLabel(day.day)} ${day.value}`).join(', ')}`}>
        {days.map((day, i) => {
          const h = day.value === 0 ? 2 : Math.max(3, (day.value / max) * (height - 4));
          return (
            <g key={day.day}>
              <rect className={i === days.length - 1 ? 'cloud-bar is-today' : hover === i ? 'cloud-bar is-hover' : 'cloud-bar'} x={i * 20} y={height - h} width={bar} height={h} rx={2} />
              <rect className="cloud-bar-hit" x={i * 20} y={0} width={20} height={height} onMouseOver={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {shown && (
        <div className="cloud-daybars-tip" role="tooltip" style={{ left: `${((hover! + 0.5) / days.length) * 100}%` }}>
          <b>{unit(shown.value)}</b><span>{dayLabel(shown.day)}</span>
        </div>
      )}
      <div className="cloud-daybars-axis"><span>{dayLabel(days[0]!.day)}</span><span>{dayLabel(days[Math.floor(days.length / 2)]!.day)}</span><span>{i18n.t('cloudOverview.today')}</span></div>
    </div>
  );
}
