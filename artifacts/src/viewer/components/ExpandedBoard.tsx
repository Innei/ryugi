import { ActionIcon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

import { type BoardSpec, isMediaBoard } from '../../shared/types';
import { t } from '../i18n';
import { VideoPlayer } from './VideoPlayer';

const styles = stylex.create({
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: cssVar.colorBgLayout,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingInline: 12,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    backgroundColor: cssVar.colorBgContainer,
    fontSize: 13,
  },
  title: { flex: 1, fontWeight: 600 },
  id: {
    marginInlineStart: 8,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 12,
    color: cssVar.colorTextTertiary,
  },
  body: { flex: 1, overflow: 'auto', padding: 32, display: 'flex', alignItems: 'flex-start' },
  frame: {
    flexShrink: 0,
    borderWidth: 0,
    backgroundColor: '#fff',
    boxShadow: cssVar.boxShadowSecondary,
  },
  media: { position: 'relative', flexShrink: 0, maxWidth: '100%', marginInline: 'auto' },
  image: { display: 'block', maxWidth: '100%', height: 'auto', marginInline: 'auto' },
});

interface ExpandedBoardProps {
  board: BoardSpec;
  frameRef?: Ref<HTMLIFrameElement>;
  id: string;
  interactive: boolean;
  onClose: () => void;
  onFrameLoad?: () => void;
  parameterAction?: ReactNode;
  parameters?: ReactNode;
  src: string;
}

export function ExpandedBoard({
  id,
  board,
  src,
  interactive,
  onClose,
  parameterAction,
  parameters,
  frameRef,
  onFrameLoad,
}: ExpandedBoardProps) {
  return (
    <div data-chrome {...stylex.props(styles.overlay)}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.title)}>
          {board.title ?? id}
          <span {...stylex.props(styles.id)}>{id}</span>
        </span>
        {parameterAction}
        <ActionIcon
          aria-label={t('chrome.close')}
          icon={X}
          size="small"
          title={t('chrome.closeEsc')}
          onClick={onClose}
        />
      </div>
      <div {...stylex.props(styles.body)}>
        {board.type === 'video' ? (
          <div
            {...stylex.props(styles.media)}
            style={{ width: board.w, height: board.h, marginBottom: 36 }}
          >
            <VideoPlayer barScale={1} barWidth={board.w} src={src} title={board.title ?? id} />
          </div>
        ) : isMediaBoard(board) ? (
          <img
            alt={board.title ?? id}
            src={src}
            {...stylex.props(styles.image)}
            style={{ width: board.w }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              flexShrink: 0,
              marginInline: 'auto',
            }}
          >
            <iframe
              ref={frameRef}
              sandbox="allow-scripts"
              src={src}
              title={board.title ?? id}
              onLoad={onFrameLoad}
              {...stylex.props(styles.frame)}
              style={{
                width: board.w,
                height: board.h,
                pointerEvents: interactive ? 'auto' : 'none',
              }}
            />
            {parameters}
          </div>
        )}
      </div>
    </div>
  );
}
