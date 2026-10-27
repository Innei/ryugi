import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { commentNames } from '../src/server/comment-names';
import { writeCredentials } from '../src/server/credentials';

const origin = 'https://ryugi.innei.dev';

function setup(gitName?: string, gitEmail?: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-names-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  if (gitName) execFileSync('git', ['config', 'user.name', gitName], { cwd: dir });
  if (gitEmail) execFileSync('git', ['config', 'user.email', gitEmail], { cwd: dir });
  return {
    dir,
    agentFile: path.join(dir, 'agent'),
    credentialsFile: path.join(dir, 'credentials.json'),
  };
}

describe('commentNames', () => {
  test('the human is the signed-in login, with the GitHub avatar', () => {
    const { dir, agentFile, credentialsFile } = setup('Git Name', 'git@example.com');
    writeCredentials(credentialsFile, { origin, token: 't', login: 'innei' });
    expect(
      commentNames({ agentFile, projectDir: dir, cloud: { origin, credentialsFile } }).human(),
    ).toEqual({
      name: 'innei',
      avatar: '/api/avatar/github/innei',
    });
  });

  test('without a sign-in the human is the project git user, with the Gravatar of user.email', () => {
    const { dir, agentFile, credentialsFile } = setup('Git Name', ' Git@Example.com ');
    expect(
      commentNames({ agentFile, projectDir: dir, cloud: { origin, credentialsFile } }).human(),
    ).toEqual({
      name: 'Git Name',
      avatar:
        '/api/avatar/gravatar/c2695de4a87d7f4470ee32f01c25b264876f4da96e3241dd50f51184381ec8fd',
    });
  });

  test('signing in later takes effect without a restart', () => {
    const { dir, agentFile, credentialsFile } = setup('Git Name');
    const names = commentNames({ agentFile, projectDir: dir, cloud: { origin, credentialsFile } });
    expect(names.human()?.name).toBe('Git Name');
    writeCredentials(credentialsFile, { origin, token: 't', login: 'innei' });
    expect(names.human()?.name).toBe('innei');
  });

  test('the agent is detected from the recorded markers, and re-read on each call', () => {
    const { dir, agentFile } = setup();
    const names = commentNames({ agentFile, projectDir: dir });
    expect(names.agent()).toBeUndefined();
    fs.writeFileSync(agentFile, JSON.stringify({ AI_AGENT: 'claude-code_2-1-304_agent' }));
    expect(names.agent()).toBe('Claude Code');
    fs.writeFileSync(agentFile, JSON.stringify({ CODEX_THREAD_ID: 'x' }));
    expect(names.agent()).toBe('Codex');
  });

  test('a corrupt agent file names no one', () => {
    const { dir, agentFile } = setup();
    fs.writeFileSync(agentFile, 'nope');
    expect(commentNames({ agentFile, projectDir: dir }).agent()).toBeUndefined();
  });
});
