import { PublishMenu } from '../components/PublishMenu';
import { useLocalFeed } from '../hooks/useArtifactFeed';
import { HtmlView } from './HtmlView';

export function HtmlLayout({ id }: { id: string }) {
  return (
    <HtmlView
      actions={<PublishMenu floating artifact={`html/${id}`} />}
      feed={useLocalFeed('html', id)}
      id={id}
    />
  );
}
