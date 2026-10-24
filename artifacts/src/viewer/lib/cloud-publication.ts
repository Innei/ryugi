import { readPublication, type Publication } from '../../shared/cloud';
import type { RelayConnection, RelayConnectionOptions } from '../document/relayConnection';
import { reportCloudHeader } from '../hooks/useCloudHeader';

export function connectPublication(id: string, options: RelayConnectionOptions, connect: (options: RelayConnectionOptions) => RelayConnection): RelayConnection {
  let closed = false;
  let latest: Publication | null = null;
  const report = (value: unknown) => {
    const publication = readPublication(value);
    if (closed || !publication) return;
    latest = publication;
    reportCloudHeader(id, { publication });
  };
  const refresh = () => void connection.request({ op: 'publication' }).then(report, () => {});
  const connection = connect({
    ...options,
    onPresence: (presence) => {
      if (!presence.online) reportCloudHeader(id, { publication: null });
      options.onPresence(presence);
    },
    onOnline: () => {
      refresh();
      options.onOnline();
    },
    onEvent: (event) => {
      if ((event as { type?: unknown })?.type === 'cloud-publication') report((event as { publication?: unknown }).publication);
      if ((event as { type?: unknown })?.type === 'change') refresh();
      options.onEvent(event);
    },
  });
  const receive = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'ryugi:publish' || event.data.id !== id) return;
    void connection.request({ op: 'publish' }).then(report, (error: Error) => report({ phase: 'failed', publishedAt: latest?.publishedAt ?? null, autoPublish: latest?.autoPublish ?? false, message: error.message }));
  };
  window.addEventListener('message', receive);
  return {
    request: connection.request,
    close() {
      closed = true;
      window.removeEventListener('message', receive);
      connection.close();
    },
  };
}
