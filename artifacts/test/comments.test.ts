import { describe, expect, test } from 'vitest';
import { applyHumanOp, emptyComments, mergeComments, parseComments, waitingOn, type CommentsFile } from '../src/shared/comments';

let counter = 0;
const ids = () => `id${++counter}`;
const at = (minute: number) => `2026-10-19T10:${String(minute).padStart(2, '0')}:00.000Z`;

function withThread(): CommentsFile {
  return applyHumanOp(emptyComments(), { op: 'create', blockId: 'b1', quote: '按事件粒度推送', text: '离线超过 7 天怎么办？' }, at(42), ids);
}

describe('applyHumanOp', () => {
  test('create opens a thread anchored to a block with the first message', () => {
    const file = withThread();
    expect(file.threads).toHaveLength(1);
    const [thread] = file.threads;
    expect(thread!.anchor).toEqual({ blockId: 'b1', quote: '按事件粒度推送' });
    expect(thread!.status).toBe('open');
    expect(thread!.messages).toEqual([{ id: expect.any(String), author: 'human', text: '离线超过 7 天怎么办？', at: at(42) }]);
  });

  test('edit and delete only touch human messages, and delete leaves a tombstone', () => {
    let file = withThread();
    const thread = file.threads[0]!;
    file = mergeComments(file, { ...file, threads: [{ ...thread, messages: [...thread.messages, { id: 'a1', author: 'agent', text: 'ok', at: at(45) }] }] }, 'agent', at(45), ids).file;
    file = applyHumanOp(file, { op: 'edit', threadId: thread.id, messageId: 'a1', text: 'hijack' }, at(46), ids);
    expect(file.threads[0]!.messages[1]!.text).toBe('ok');
    file = applyHumanOp(file, { op: 'delete', threadId: thread.id, messageId: thread.messages[0]!.id }, at(47), ids);
    expect(file.threads[0]!.messages[0]).toMatchObject({ deleted: true, text: '' });
  });
});

describe('mergeComments', () => {
  test('a stale whole-file agent write keeps a human message added after it', () => {
    const before = withThread();
    const threadId = before.threads[0]!.id;
    const stale = structuredClone(before);
    const later = applyHumanOp(before, { op: 'reply', threadId, text: '还有 debug 包' }, at(50), ids);
    stale.threads[0]!.messages.push({ id: 'a1', author: 'agent', text: '回退到快照同步', at: at(48) });
    const { file } = mergeComments(later, stale, 'agent', at(51), ids);
    expect(file.threads[0]!.messages.map((m) => m.text)).toEqual(['离线超过 7 天怎么办？', '回退到快照同步', '还有 debug 包']);
  });

  test('an agent edit of a human message is ignored with a warning', () => {
    const before = withThread();
    const tampered = structuredClone(before);
    tampered.threads[0]!.messages[0]!.text = 'rewritten';
    const { file, warnings } = mergeComments(before, tampered, 'agent', at(50), ids);
    expect(file.threads[0]!.messages[0]!.text).toBe('离线超过 7 天怎么办？');
    expect(warnings).toEqual([expect.stringContaining('cannot change a human message')]);
  });

  test('an agent cannot add a human message', () => {
    const before = withThread();
    const forged = structuredClone(before);
    forged.threads[0]!.messages.push({ id: 'h9', author: 'human', text: 'yes', at: at(50) });
    const { file, warnings } = mergeComments(before, forged, 'agent', at(50), ids);
    expect(file.threads[0]!.messages).toHaveLength(1);
    expect(warnings).toEqual([expect.stringContaining('cannot write human messages')]);
  });

  test('a delete survives a stale write that still has the text', () => {
    const before = withThread();
    const thread = before.threads[0]!;
    const stale = structuredClone(before);
    const deleted = applyHumanOp(before, { op: 'delete', threadId: thread.id, messageId: thread.messages[0]!.id }, at(50), ids);
    const { file } = mergeComments(deleted, stale, 'agent', at(51), ids);
    expect(file.threads[0]!.messages[0]).toMatchObject({ deleted: true, text: '' });
  });

  test('a missing thread in the incoming file is kept', () => {
    const before = withThread();
    expect(mergeComments(before, emptyComments(), 'agent', at(50), ids).file.threads).toHaveLength(1);
  });

  test('status is last-writer-wins, and a resolve without a timestamp counts as now', () => {
    const before = withThread();
    const resolved = structuredClone(before);
    resolved.threads[0]!.status = 'resolved';
    const merged = mergeComments(before, resolved, 'agent', at(50), ids).file;
    expect(merged.threads[0]!.status).toBe('resolved');
    const reopened = applyHumanOp(merged, { op: 'reopen', threadId: before.threads[0]!.id }, at(55), ids);
    expect(mergeComments(reopened, merged, 'agent', at(56), ids).file.threads[0]!.status).toBe('open');
  });

  test('the agent can open a thread; ids and times it leaves out are filled in', () => {
    const incoming = { version: 1, threads: [{ anchor: { blockId: 'b2', quote: '阈值' }, messages: [{ author: 'agent', text: '7 天合适吗？' }] }] };
    const { file } = mergeComments(emptyComments(), parseComments(JSON.stringify(incoming)), 'agent', at(50), ids);
    const [thread] = file.threads;
    expect(thread!.id).toBeTruthy();
    expect(thread!.status).toBe('open');
    expect(thread!.messages[0]).toMatchObject({ author: 'agent', at: at(50) });
    expect(waitingOn(thread!)).toBe('human');
  });
});

describe('parseComments', () => {
  test('rejects JSON that is not a comments file', () => {
    expect(() => parseComments('{"threads": 3}')).toThrow('threads must be an array');
    expect(() => parseComments('nope')).toThrow();
  });
});

test('waitingOn follows the last message that is not deleted', () => {
  const file = withThread();
  expect(waitingOn(file.threads[0]!)).toBe('agent');
  expect(waitingOn({ ...file.threads[0]!, status: 'resolved' })).toBeNull();
});

describe('agent writes without ids', () => {
  test('merging the same id-less reply twice adds it once', () => {
    const before = withThread();
    const reply = structuredClone(before) as unknown as { threads: { messages: unknown[] }[] };
    reply.threads[0]!.messages.push({ author: 'agent', text: 'because' });
    const once = mergeComments(before, reply as never, 'agent', at(50), ids).file;
    const twice = mergeComments(once, reply as never, 'agent', at(51), ids).file;
    expect(twice.threads[0]!.messages.map((m) => m.text)).toEqual(['离线超过 7 天怎么办？', 'because']);
  });

  test('merging the same id-less agent thread twice opens it once', () => {
    const incoming = { threads: [{ anchor: { blockId: 'b2', quote: '阈值' }, messages: [{ author: 'agent', text: '7 天合适吗？' }] }] };
    const once = mergeComments(emptyComments(), incoming as never, 'agent', at(50), ids).file;
    const twice = mergeComments(once, incoming as never, 'agent', at(51), ids).file;
    expect(twice.threads).toHaveLength(1);
  });
});
