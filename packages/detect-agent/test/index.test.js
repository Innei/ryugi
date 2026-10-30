import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AGENT_DISPLAY_NAMES, AGENT_MARKERS, detectAgent } from '../src/index.js';

const cases = [
  [{ AI_AGENT: 'claude-code_2-1-304_agent', CLAUDECODE: '1' }, 'Claude Code'],
  [{ CLAUDECODE: '1' }, 'Claude Code'],
  [{ OMPCODE: '1', CLAUDECODE: '1', AGENT: '1' }, 'OMP'],
  [{ OMPCODE: '1' }, 'OMP'],
  [{ AI_AGENT: 'oh-my-pi@1', CLAUDECODE: '1' }, 'OMP'],
  [{ GROK_AGENT: '1', CLAUDECODE: '1', AGENT: '1' }, 'Grok'],
  [{ GROK_SESSION_ID: 'abc', CLAUDECODE: '1' }, 'Grok'],
  [{ AI_AGENT: 'grok-cli' }, 'Grok'],
  [{ CLAUDECODE: '1', CLAUDE_CODE_IS_COWORK: '1' }, 'Claude Cowork'],
  [{ CODEX_THREAD_ID: 'abc' }, 'Codex'],
  [{ CODEX_SANDBOX: 'seatbelt' }, 'Codex'],
  [{ CODEX_CI: '1' }, 'Codex'],
  [{ CURSOR_AGENT: '1' }, 'Cursor'],
  [{ CURSOR_TRACE_ID: 'x' }, 'Cursor'],
  [{ AI_AGENT: 'cursor-cli' }, 'Cursor'],
  [{ GEMINI_CLI: '1' }, 'Gemini CLI'],
  [{ AI_AGENT: 'github-copilot-cli' }, 'GitHub Copilot'],
  [{ COPILOT_CLI: '1' }, 'GitHub Copilot'],
  [{ KILO: '1', OPENCODE: '1', AGENT: '1' }, 'Kilo Code'],
  [{ OPENCODE: '1', AGENT: '1' }, 'OpenCode'],
  [{ OPENCODE_CLIENT: 'cli' }, 'OpenCode'],
  [{ QWEN_CODE: '1' }, 'Qwen Code'],
  [{ ANTIGRAVITY_AGENT: '1' }, 'Antigravity'],
  [{ AUGMENT_AGENT: '1' }, 'Augment'],
  [{ AGENT: 'goose', GOOSE_TERMINAL: '1' }, 'Goose'],
  [{ AGENT: 'amp' }, 'Amp'],
  [{ CLINE_ACTIVE: 'true' }, 'Cline'],
  [{ ROO_ACTIVE: 'true' }, 'Roo Code'],
  [{ AI_AGENT: 'devin@1' }, 'Devin'],
];

describe('detectAgent', () => {
  for (const [env, name] of cases) {
    test(`${JSON.stringify(env)} → ${name}`, () => {
      assert.equal(detectAgent(env), name);
    });
  }

  test('an unknown AI_AGENT name is shown as written', () => {
    assert.equal(detectAgent({ AI_AGENT: 'my-bot@2' }), 'my-bot');
  });

  test('AI_AGENT wins over tool-specific markers', () => {
    assert.equal(detectAgent({ AI_AGENT: 'codex', CLAUDECODE: '1' }), 'Codex');
  });

  test('AGENT=1 proves an agent without naming it', () => {
    assert.equal(detectAgent({ AGENT: '1' }), undefined);
  });

  test('the markers detectAgent reads are exported', () => {
    for (const key of ['OMPCODE', 'GROK_AGENT', 'GROK_SESSION_ID', 'CLAUDECODE', 'CODEX_THREAD_ID'])
      assert.ok(AGENT_MARKERS.includes(key), key);
  });

  test('display names are unique', () => {
    assert.equal(new Set(AGENT_DISPLAY_NAMES).size, AGENT_DISPLAY_NAMES.length);
    assert.ok(AGENT_DISPLAY_NAMES.includes('Claude Code'));
  });

  test('nothing detected', () => {
    assert.equal(detectAgent({ HOME: '/u' }), undefined);
  });
});
