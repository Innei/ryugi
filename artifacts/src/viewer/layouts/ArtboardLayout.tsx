import { PublishMenu } from '../components/PublishMenu';
import { useLocalFeed } from '../hooks/useArtifactFeed';
import { useCanvasData } from '../hooks/useCanvasData';
import { ArtboardView } from './ArtboardView';

export function ArtboardLayout({ id }: { id: string }) {
  const data = useCanvasData(useLocalFeed('artboard', id));
  return <ArtboardView id={id} artifact={`artboard/${id}`} {...data} actions={<PublishMenu artifact={`artboard/${id}`} />} />;
}
