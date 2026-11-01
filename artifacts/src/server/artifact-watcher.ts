import type { ServerMessage } from '../shared/types';
import {
  artifactKeyOf,
  type ArtifactRef,
  artifactSignature,
  resolveArtifactDir,
} from './artifacts';
import type { ServerContext } from './context';
import { watchTree } from './watch';
import { textFrame } from './ws';

export function watchArtifacts(ctx: ServerContext) {
  const { root, signatures, clients, documents, boardComments, runtimeWarnings } = ctx;
  return watchTree(
    root,
    (files) => {
      const byArtifact = new Map<string, { ref: ArtifactRef; files: string[] }>();
      for (const file of files) {
        const ref = artifactKeyOf(file);
        if (!ref) continue;
        const key = `${ref.type}/${ref.id}`;
        const entry = byArtifact.get(key) ?? { ref, files: [] };
        const inner = file.slice(key.length + 1);
        if (inner) entry.files.push(inner);
        byArtifact.set(key, entry);
      }
      for (const [key, { ref, files: changed }] of byArtifact) {
        const dir = resolveArtifactDir(root, ref.type, ref.id);
        if (!dir) {
          signatures.delete(key);
          ctx.autoPublisher?.removed(key);
          const frame = textFrame(
            JSON.stringify({
              type: 'change',
              artifact: key,
              files: changed,
            } satisfies ServerMessage),
          );
          for (const socket of clients) socket.write(frame);
          continue;
        }
        if (ref.type === 'document' && (changed.includes('doc.xml') || changed.length === 0))
          documents.fileChanged(ref.id);
        if (ref.type === 'document' && changed.includes('comments.json'))
          documents.commentsChanged(ref.id);
        if (ref.type === 'artboard' && changed.includes('comments.json'))
          boardComments.sync(ref.id);
        if (
          ref.type === 'artboard' &&
          (changed.some((file) => file !== 'comments.json') || changed.length === 0)
        )
          boardComments.boardsChanged(ref.id);
        if (signatures.get(key) === artifactSignature(dir, ref.type)) continue;
        ctx.autoPublisher?.changed(key);
        runtimeWarnings.delete(key);
        const payload = ctx.refreshState(ref, dir);
        const frame = textFrame(
          JSON.stringify({ type: 'change', artifact: key, files: changed } satisfies ServerMessage),
        );
        for (const socket of clients) socket.write(frame);
        ctx.relay?.emit(key, { type: 'change', artifact: key, files: changed });
        ctx.direct.emit(key, { type: 'change', artifact: key, files: changed });
        ctx.cloud?.changed(key);
        ctx.changeListeners.forEach((listener) => listener(ref, payload, changed));
      }
      ctx.touch();
    },
    ctx.options.debounceMs,
  );
}
