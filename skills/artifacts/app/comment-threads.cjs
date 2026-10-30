'use strict';

const stampOf = (m) => m.editedAt || m.at;
const humanStatus = (thread) => (thread.statusBy || 'human') === 'human';

function waitingOnAgent(thread) {
  if (thread.status === 'resolved') return false;
  const live = (thread.messages || []).filter((m) => !m.deleted);
  return live.length > 0 && live.at(-1).author === 'human';
}

function changedSince(thread, cursor) {
  const messages = thread.messages || [];
  let changed = false;
  let newThread = false;
  messages.forEach((m, index) => {
    if (m.author !== 'human') return;
    const created = m.at > cursor;
    if (m.deleted) {
      if (!created && stampOf(m) > cursor) changed = true;
      return;
    }
    if (created || stampOf(m) > cursor) changed = true;
    if (created && index === 0) newThread = true;
  });
  if (
    !newThread &&
    humanStatus(thread) &&
    thread.statusAt > cursor &&
    messages.some((m) => m.at <= cursor)
  )
    changed = true;
  return changed;
}

// Mirrors unreadThreads in artifacts/src/shared/comments.ts; artifacts/test/hook-parity.test.ts keeps them in step.
function unreadThreadCount(file, cursor) {
  const threads = file && Array.isArray(file.threads) ? file.threads : [];
  return threads.filter((thread) =>
    cursor === null ? waitingOnAgent(thread) : changedSince(thread, cursor),
  ).length;
}

module.exports = { unreadThreadCount };
