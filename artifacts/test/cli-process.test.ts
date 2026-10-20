import { expect, test } from 'vitest';
import { isNodeImage } from '../src/cli/process';

test.each([
  ['"node.exe","4242","Console","1","48,120 K"', true],
  ['"Node.EXE","4242","Console","1","48,120 K"', true],
  ['"chrome.exe","4242","Console","1","148,120 K"', false],
  ['INFO: No tasks are running which match the specified criteria.', false],
  ['', false],
])('tasklist line %j is our node server: %s', (line, expected) => {
  expect(isNodeImage(line)).toBe(expected);
});
