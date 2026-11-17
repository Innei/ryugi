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
const isAntigravity = !fallbackProject && Boolean(process.env.ANTIGRAVITY_AGENT);
if (isAntigravity) {
  process.stdout.write('{}\n');
}
if (fallbackProject) {
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
  if (isAntigravity) {
    void postToServer(project, '/api/cloud/flush');
  }
  const host = isAntigravity ? 'antigravity' : 'claude';
  const event = eventFrom(input, host, at);
  if (event) void postToServer(project, '/api/agent/event', event);
});
