'use strict';

const { eventFrom, postToServer, readStdin } = require('../skills/artifacts/app/agent-event.cjs');

function projectOf(cwd) {
  try {
    return require('../skills/artifacts/app/comment-subscriptions.cjs').projectRoot(cwd);
  } catch {
    return null;
  }
}

const at = Date.now();
const fallbackProject = process.argv[2];
if (process.env.ANTIGRAVITY_AGENT) {
  process.stdout.write('{}\n');
}
if (fallbackProject && !process.env.ANTIGRAVITY_AGENT) {
  void postToServer(fallbackProject, '/api/cloud/flush');
}
void readStdin().then((input) => {
  const rawCwd =
    input && typeof input.cwd === 'string' && input.cwd
      ? input.cwd
      : Array.isArray(input?.workspacePaths) && typeof input.workspacePaths[0] === 'string'
        ? input.workspacePaths[0]
        : null;
  const project = (rawCwd ? projectOf(rawCwd) : null) || fallbackProject;
  if (!project) return;
  if (process.env.ANTIGRAVITY_AGENT) {
    void postToServer(project, '/api/cloud/flush');
  }
  const host = process.env.ANTIGRAVITY_AGENT ? 'antigravity' : 'claude';
  const event = eventFrom(input, host, at);
  if (event) void postToServer(project, '/api/agent/event', event);
});
