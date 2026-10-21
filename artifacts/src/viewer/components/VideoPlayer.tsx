import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Maximize2, Pause, Play, Repeat } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const BAR_HEIGHT = 36;
const MIN_BAR_WIDTH = 160;
const RATES = [1, 1.5, 2, 0.5];

const styles = stylex.create({
  video: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', objectFit: 'contain', backgroundColor: '#000', pointerEvents: 'none' },
  bar: {
    position: 'absolute',
    left: 0,
    top: '100%',
    height: BAR_HEIGHT,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingInline: 12,
    transformOrigin: '0 0',
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#2a2a2a',
    color: '#bbb',
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    pointerEvents: 'auto',
    cursor: 'default',
    userSelect: 'none',
  },
  icon: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: { default: '#ddd', ':hover': '#fff' },
    fontFamily: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
  },
  off: { color: { default: '#777', ':hover': '#bbb' } },
  time: { flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  track: { position: 'relative', flex: 1, height: 14, display: 'flex', alignItems: 'center', cursor: 'pointer' },
  rail: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: '#3a3a3a' },
  fill: { position: 'absolute', left: 0, height: 3, backgroundColor: '#fff' },
  rate: { minWidth: 30, fontWeight: 600 },
});

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

interface Props {
  src: string;
  title: string;
  barScale: number;
  barWidth: number;
  onExpand?: () => void;
}

export function VideoPlayer({ src, title, barScale, barWidth, onExpand }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const sync = () => {
      setTime(el.currentTime);
      setDuration(el.duration);
      setPlaying(!el.paused);
    };
    const events = ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'seeked'];
    for (const name of events) el.addEventListener(name, sync);
    return () => {
      for (const name of events) el.removeEventListener(name, sync);
    };
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play().then(() => setPlaying(true), () => setPlaying(false));
    else el.pause();
  };
  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length]!;
    if (video.current) video.current.playbackRate = next;
    setRate(next);
  };
  const toggleLoop = () => {
    if (video.current) video.current.loop = !loop;
    setLoop(!loop);
  };
  const seek = (event: ReactPointerEvent<HTMLElement>) => {
    const el = video.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    el.currentTime = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * el.duration;
    setTime(el.currentTime);
  };

  return (
    <>
      <video ref={video} src={src} title={title} muted playsInline preload="metadata" {...stylex.props(styles.video)} />
      {barWidth >= MIN_BAR_WIDTH && (
        <div
          data-chrome="video-controls"
          onPointerDown={(event) => event.stopPropagation()}
          {...stylex.props(styles.bar)}
          style={{ width: barWidth, transform: `scale(${barScale})` }}
        >
          <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={toggle} {...stylex.props(styles.icon)}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span {...stylex.props(styles.time)}>{clock(time)} / {clock(duration)}</span>
          <div
            role="slider"
            aria-label="进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration || 0)}
            aria-valuenow={Math.round(time)}
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              seek(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) seek(event);
            }}
            {...stylex.props(styles.track)}
          >
            <span {...stylex.props(styles.rail)} />
            <span {...stylex.props(styles.fill)} style={{ width: `${duration > 0 ? (time / duration) * 100 : 0}%` }} />
          </div>
          <button type="button" aria-label="倍速" onClick={cycleRate} {...stylex.props(styles.icon, styles.rate)}>
            {rate}×
          </button>
          <button type="button" aria-label="循环" aria-pressed={loop} onClick={toggleLoop} {...stylex.props(styles.icon, !loop && styles.off)}>
            <Repeat size={14} />
          </button>
          {onExpand && (
            <button type="button" aria-label="放大" onClick={onExpand} {...stylex.props(styles.icon)}>
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
