import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

test('zcode plugin manifest matches adeck version and does not duplicate default hooks.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, '.zcode-plugin', 'plugin.json'), 'utf8'),
  );

  assert.equal(manifest.name, 'adeck');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.skills, 'skills');
  assert.equal(manifest.hooks, undefined);
});

test('session-start emits exact ZCode JSON contract when both ZCODE_PLUGIN_ROOT and CLAUDE_PLUGIN_ROOT are set', () => {
  const runHook = path.join(repoRoot, 'hooks', 'run-hook.cmd');
  const cmd = process.platform === 'win32' ? 'cmd.exe' : 'bash';
  const args =
    process.platform === 'win32' ? ['/c', runHook, 'session-start'] : [runHook, 'session-start'];

  const stdout = execFileSync(cmd, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ZCODE_PLUGIN_ROOT: repoRoot,
      CLAUDE_PLUGIN_ROOT: repoRoot,
    },
  });

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput?.hookEventName, 'SessionStart');
  assert.equal(parsed.additional_context, undefined);
  assert.equal(parsed.additionalContext, undefined);

  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.match(ctx, /<EXTREMELY_IMPORTANT>/);
  assert.match(ctx, /adeck:brainstorming/);
  assert.match(ctx, /ZCode Tool Mapping/);
  assert.match(ctx, /`ApplyPatch`/);
  assert.match(ctx, /<\/EXTREMELY_IMPORTANT>/);
});
