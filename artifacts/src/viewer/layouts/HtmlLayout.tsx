import { PublishMenu } from '../components/PublishMenu';
import { useLocalFeed } from '../hooks/useArtifactFeed';
import { HtmlView } from './HtmlView';

export function HtmlLayout({ id }: { id: string }) {
  return <HtmlView id={id} feed={useLocalFeed('html', id)} actions={<PublishMenu artifact={`html/${id}`} floating />} />;
}
