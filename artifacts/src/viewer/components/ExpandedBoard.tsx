import { ActionIcon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { isMediaBoard, type BoardSpec } from '../../shared/types';
import { VideoPlayer } from './VideoPlayer';
import { t } from '../i18n';

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
  id: string;
  board: BoardSpec;
  src: string;
  interactive: boolean;
  onClose: () => void;
  parameterAction?: ReactNode;
  parameters?: ReactNode;
  frameRef?: Ref<HTMLIFrameElement>;
  onFrameLoad?: () => void;
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
          icon={X}
          size="small"
          title={t('chrome.closeEsc')}
          aria-label={t('chrome.close')}
          onClick={onClose}
        />
      </div>
      <div {...stylex.props(styles.body)}>
        {board.type === 'video' ? (
          <div
            {...stylex.props(styles.media)}
            style={{ width: board.w, height: board.h, marginBottom: 36 }}
          >
            <VideoPlayer src={src} title={board.title ?? id} barScale={1} barWidth={board.w} />
          </div>
        ) : isMediaBoard(board) ? (
          <img
            src={src}
            alt={board.title ?? id}
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
              onLoad={onFrameLoad}
              title={board.title ?? id}
              src={src}
              sandbox="allow-scripts"
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
