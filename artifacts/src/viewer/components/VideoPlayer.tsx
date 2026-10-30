import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Maximize2, Repeat } from 'lucide-react';
import { motion } from 'motion/react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

import { useTranslation } from '../i18n';
import { color } from '../tokens.stylex';

const BAR_HEIGHT = 36;
const MIN_BAR_WIDTH = 160;
const RATES = [1, 1.5, 2, 0.5];

const styles = stylex.create({
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
    backgroundColor: color.black,
    pointerEvents: 'none',
  },
  surface: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    outlineStyle: { 'default': 'none', ':focus-visible': 'solid' },
    outlineWidth: 2,
    outlineColor: color.white,
    outlineOffset: -3,
  },
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
    backgroundColor: color.media,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color.mediaBorder,
    color: color.mediaMutedHover,
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
    color: { 'default': color.mediaHover, ':hover': color.white },
    fontFamily: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
  },
  off: { color: { 'default': color.mediaOff, ':hover': color.mediaMutedHover } },
  time: { flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  track: {
    position: 'relative',
    flex: 1,
    height: 14,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  rail: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: color.mediaRail },
  fill: { position: 'absolute', left: 0, height: 3, backgroundColor: color.white },
  rate: { minWidth: 30, fontWeight: 600 },
  failed: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 16,
    backgroundColor: color.media,
    color: color.mediaMuted,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    textAlign: 'center',
    pointerEvents: 'none',
  },
});

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

function PlaybackIcon({ playing }: { playing: boolean }) {
  return (
    <svg aria-hidden="true" fill="currentColor" height="16" viewBox="0 0 24 24" width="16">
      {[false, true].map((pause) => (
        <motion.g
          initial={false}
          key={String(pause)}
          style={{ transformOrigin: '12px 12px' }}
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          animate={{
            opacity: playing === pause ? 1 : 0,
            scale: playing === pause ? 1 : 0.25,
            filter: playing === pause ? 'blur(0px)' : 'blur(4px)',
          }}
        >
          {pause ? (
            <>
              <rect height="16" rx="1" width="4" x="6" y="4" />
              <rect height="16" rx="1" width="4" x="14" y="4" />
            </>
          ) : (
            <path d="M8 4.6c-.9-.5-2 .1-2 1.1v12.6c0 1 1.1 1.6 2 1.1l11-6.3c.9-.5.9-1.7 0-2.2Z" />
          )}
        </motion.g>
      ))}
    </svg>
  );
}

interface Props {
  barScale: number;
  barWidth: number;
  onExpand?: () => void;
  src: string;
  title: string;
}

export function VideoPlayer({ src, title, barScale, barWidth, onExpand }: Props) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const sync = () => {
      setFailed(false);
      setTime(el.currentTime);
      setDuration(el.duration);
      setPlaying(!el.paused);
    };
    const events = ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'seeked'];
    const fail = () => setFailed(true);
    for (const name of events) el.addEventListener(name, sync);
    el.addEventListener('error', fail);
    return () => {
      for (const name of events) el.removeEventListener(name, sync);
      el.removeEventListener('error', fail);
    };
  }, []);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(!el.paused));
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
    el.currentTime =
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * el.duration;
    setTime(el.currentTime);
  };

  return (
    <>
      <video
        muted
        playsInline
        preload="metadata"
        ref={video}
        src={src}
        title={title}
        {...stylex.props(styles.video)}
      />
      <button
        data-video-surface
        aria-label={playing ? t('video.pauseTitle', { title }) : t('video.playTitle', { title })}
        type="button"
        onClick={(event) => {
          if (
            !event.detail ||
            !press.current ||
            Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) < 4
          )
            toggle();
          press.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        }}
        onPointerDown={(event) => {
          press.current = { x: event.clientX, y: event.clientY };
        }}
        {...stylex.props(styles.surface)}
      />
      {failed && <div {...stylex.props(styles.failed)}>{t('video.failed')}</div>}
      {barWidth >= MIN_BAR_WIDTH && (
        <div
          data-chrome="video-controls"
          onPointerDown={(event) => event.stopPropagation()}
          {...stylex.props(styles.bar)}
          style={{ width: barWidth, transform: `scale(${barScale})` }}
        >
          <button
            aria-label={playing ? t('video.pause') : t('video.play')}
            type="button"
            onClick={toggle}
            {...stylex.props(styles.icon)}
          >
            <PlaybackIcon playing={playing} />
          </button>
          <span {...stylex.props(styles.time)}>
            {clock(time)} / {clock(duration)}
          </span>
          <div
            aria-label={t('video.progress')}
            aria-valuemax={Math.round(duration || 0)}
            aria-valuemin={0}
            aria-valuenow={Math.round(time)}
            role="slider"
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
            <span
              {...stylex.props(styles.fill)}
              style={{ width: `${duration > 0 ? (time / duration) * 100 : 0}%` }}
            />
          </div>
          <button
            aria-label={t('video.speed')}
            type="button"
            onClick={cycleRate}
            {...stylex.props(styles.icon, styles.rate)}
          >
            {rate}×
          </button>
          <button
            aria-label={t('video.loop')}
            aria-pressed={loop}
            type="button"
            onClick={toggleLoop}
            {...stylex.props(styles.icon, !loop && styles.off)}
          >
            <Repeat size={14} />
          </button>
          {onExpand && (
            <button
              aria-label={t('video.expand')}
              type="button"
              onClick={onExpand}
              {...stylex.props(styles.icon)}
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
