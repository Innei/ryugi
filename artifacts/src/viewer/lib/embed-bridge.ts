export const EMBED_HEARTBEAT_MS = 1000;
export const EMBED_LOST_MS = 5000;

const HELLO = 'ryugi:embed:hello';
const HEARTBEAT = 'ryugi:embed:heartbeat';

type MessageWindow = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export function createEmbedChild({
  parentOrigin,
  win = window,
}: {
  parentOrigin: string;
  win?: MessageWindow & { parent: Pick<Window, 'postMessage'> };
}) {
  const post = (type: string) => win.parent.postMessage({ type }, parentOrigin);
  post(HELLO);
  const timer = setInterval(() => post(HEARTBEAT), EMBED_HEARTBEAT_MS);
  return { close: () => clearInterval(timer) };
}

export function startEmbedChild(
  doc: Pick<Document, 'documentElement'> = document,
  win: MessageWindow & { parent: Pick<Window, 'postMessage'> } = window,
) {
  const parentOrigin = doc.documentElement.dataset.ryugiEmbedParent;
  return parentOrigin ? createEmbedChild({ parentOrigin, win }) : null;
}

export function createEmbedHost({
  frame,
  childOrigin,
  onReady,
  onLost,
  lostAfterMs = EMBED_LOST_MS,
  win = window,
}: {
  childOrigin: string;
  frame: () => Window | null | undefined;
  lostAfterMs?: number;
  onLost: () => void;
  onReady: () => void;
  win?: MessageWindow;
}) {
  let ready = false;
  let lost = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      lost = true;
      win.removeEventListener('message', onMessage);
      onLost();
    }, lostAfterMs);
  };
  const onMessage = (event: MessageEvent) => {
    if (lost || event.origin !== childOrigin || event.source !== frame()) return;
    const type = (event.data as { type?: unknown } | null)?.type;
    if (type !== HELLO && type !== HEARTBEAT) return;
    arm();
    if (!ready) {
      ready = true;
      onReady();
    }
  };
  win.addEventListener('message', onMessage);
  arm();
  return {
    close() {
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
    },
  };
}
