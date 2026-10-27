import { Component, memo, type ReactNode, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

export type View = () => ReactNode;

interface Entry {
  key: string;
  revision: number;
  view: View;
}

interface Options {
  onError: (error: unknown) => void;
  wrap: (children: ReactNode) => ReactNode;
}

interface BoundaryProps {
  children: ReactNode;
  onError: (error: unknown) => void;
  revision: number;
}

class Boundary extends Component<BoundaryProps, { failedAt: number | null }> {
  state = { failedAt: null as number | null };

  static getDerivedStateFromError() {
    return { failedAt: -1 };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: { failedAt: number | null }) {
    if (state.failedAt === -1) return { failedAt: props.revision };
    if (state.failedAt !== null && state.failedAt !== props.revision) return { failedAt: null };
    return null;
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failedAt === null ? this.props.children : null;
  }
}

const HostView = memo(function HostView({ view }: { view: View; revision: number }) {
  return view();
});

export function createHostRoot({ wrap, onError }: Options) {
  const entries = new Map<HTMLElement, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: [HTMLElement, Entry][] = [];
  let nextKey = 0;

  const publish = () => {
    snapshot = [...entries];
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getSnapshot = () => snapshot;

  function Hosts() {
    const hosts = useSyncExternalStore(subscribe, getSnapshot);
    return wrap(
      hosts.map(([el, entry]) =>
        createPortal(
          <Boundary revision={entry.revision} onError={onError}>
            <HostView revision={entry.revision} view={entry.view} />
          </Boundary>,
          el,
          entry.key,
        ),
      ),
    );
  }

  const container = document.createElement('div');
  container.dataset.ryugiRoot = '';
  (document.body ?? document.documentElement).append(container);
  createRoot(container).render(<Hosts />);

  return {
    register(el: HTMLElement, view: View) {
      entries.set(el, { key: `h${nextKey++}`, revision: 0, view });
      publish();
    },
    update(el: HTMLElement) {
      const entry = entries.get(el);
      if (!entry) return;
      entries.set(el, { ...entry, revision: entry.revision + 1 });
      publish();
    },
    unregister(el: HTMLElement) {
      if (entries.delete(el)) publish();
    },
  };
}
