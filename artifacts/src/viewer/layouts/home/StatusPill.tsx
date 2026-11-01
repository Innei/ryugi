import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';

import { useHubStatus } from '../../hooks/useHubStatus';
import { useTranslation } from '../../i18n';
import { statusStyles as styles } from './status-styles';
import { StatusPanel } from './StatusPanel';

export function StatusPill({ onProjectsChanged }: { onProjectsChanged?: () => void }) {
  const { t } = useTranslation();
  const { status, offline, refresh } = useHubStatus();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const down = offline || !status;
  const relayLive = !down && status.relay.connected;

  return (
    <div ref={anchor} {...stylex.props(styles.anchor)}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        type="button"
        {...stylex.props(styles.pill)}
        onClick={() => setOpen((value) => !value)}
      >
        <i {...stylex.props(styles.dot, relayLive && styles.dotLive, offline && styles.dotDown)} />
        {down ? (
          t('server.offline')
        ) : (
          <>
            v{status.version}
            <span {...stylex.props(styles.separator)}>·</span>
            {relayLive ? t('server.relayConnected') : t('server.relayOffline')}
            {status.latest && <span {...stylex.props(styles.badge)}>{t('server.update')}</span>}
          </>
        )}
      </button>
      {open && (
        <div aria-label={t('server.panelLabel')} role="dialog" {...stylex.props(styles.panel)}>
          {status ? (
            <StatusPanel
              status={status}
              onChanged={() => {
                void refresh();
                onProjectsChanged?.();
              }}
            />
          ) : (
            t('server.offline')
          )}
        </div>
      )}
    </div>
  );
}
