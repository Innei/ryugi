import { PublishMenu } from '../components/PublishMenu';
import { useLocalFeed } from '../hooks/useArtifactFeed';
import { useCanvasData } from '../hooks/useCanvasData';
import { ArtboardView } from './ArtboardView';

export function ArtboardLayout({ id }: { id: string }) {
  const data = useCanvasData(useLocalFeed('artboard', id));
  return (
    <ArtboardView
      artifact={`artboard/${id}`}
      id={id}
      {...data}
      actions={<PublishMenu artifact={`artboard/${id}`} />}
    />
  );
}
