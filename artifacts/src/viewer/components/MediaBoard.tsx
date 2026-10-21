import * as stylex from '@stylexjs/stylex';
import type { BoardSpec } from '../../shared/types';
import { VideoPlayer } from './VideoPlayer';

const styles = stylex.create({
  image: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', objectFit: 'contain', backgroundColor: '#fff', pointerEvents: 'none' },
});

interface Props {
  id: string;
  board: BoardSpec;
  src: string;
  zoom: number;
  onExpand?: () => void;
}

export function MediaBoard({ id, board, src, zoom, onExpand }: Props) {
  if (board.type === 'video') return <VideoPlayer src={src} title={board.title ?? id} barScale={1 / zoom} barWidth={board.w * zoom} onExpand={onExpand} />;
  return <img src={src} alt={board.title ?? id} draggable={false} {...stylex.props(styles.image)} />;
}
