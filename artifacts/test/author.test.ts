import { expect, test } from 'vitest';
import { AGENT_DISPLAY_NAMES } from '../src/server/agent';
import { agentIconOf, authorOf } from '../src/viewer/document/author';

test.each([
  [{ author: 'human' as const, name: 'innei' }, { label: 'innei', initial: 'I' }],
  [{ author: 'human' as const }, { label: '你', initial: '你' }],
  [{ author: 'agent' as const, name: 'Claude Code' }, { label: 'Claude Code', initial: 'C' }],
  [{ author: 'agent' as const }, { label: 'Agent', initial: 'A' }],
  [{ author: 'human' as const, name: '𝓩oe' }, { label: '𝓩oe', initial: '𝓩' }],
])('%o', (message, expected) => {
  expect(authorOf(message)).toEqual(expected);
});

test('every agent the server can name has an icon, except the ones lobe-icons lacks', () => {
  const missing = AGENT_DISPLAY_NAMES.filter((name) => !agentIconOf(name));
  expect(missing).toEqual(['OMP', 'Augment']);
});

test('an unknown agent has no icon', () => {
  expect(agentIconOf('my-bot')).toBeUndefined();
});
