import { PublishMenu } from '../components/PublishMenu';
import { DocumentView } from './DocumentView';
import { useLocalTransport } from './useDocumentTransport';

export default function DocumentPage({ id }: { id: string }) {
  const { transport, live } = useLocalTransport(id);
  return (
    <DocumentView
      actions={<PublishMenu artifact={`document/${id}`} />}
      id={id}
      live={live}
      transport={transport}
    />
  );
}
