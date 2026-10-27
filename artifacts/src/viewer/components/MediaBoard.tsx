import * as stylex from '@stylexjs/stylex';

import type { BoardSpec } from '../../shared/types';
import { VideoPlayer } from './VideoPlayer';

const styles = stylex.create({
  image: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
    backgroundColor: '#fff',
    pointerEvents: 'none',
  },
});

interface Props {
  board: BoardSpec;
  id: string;
  onExpand?: () => void;
  src: string;
  zoom: number;
}

export function MediaBoard({ id, board, src, zoom, onExpand }: Props) {
  if (board.type === 'video')
    return (
      <VideoPlayer
        barScale={1 / zoom}
        barWidth={board.w * zoom}
        src={src}
        title={board.title ?? id}
        onExpand={onExpand}
      />
    );
  return (
    <img alt={board.title ?? id} draggable={false} src={src} {...stylex.props(styles.image)} />
  );
}
