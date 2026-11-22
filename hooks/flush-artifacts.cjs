'use strict';

const { setRyugiTitle } = require('../skills/artifacts/app/process-title.cjs');
const {
  eventFrom,
  hubProjectOf,
  postToServer,
  readStdin,
} = require('../skills/artifacts/app/agent-event.cjs');

function projectOf(cwd) {
  try {
    return require('../skills/artifacts/app/comment-subscriptions.cjs').projectRoot(cwd);
  } catch {
    return null;
  }
}

setRyugiTitle('hook');
const at = Date.now();
const fallbackProject = process.argv[2];
const isAntigravity =
  !fallbackProject &&
  !process.env.CLAUDE_PROJECT_DIR &&
  !process.env.CLAUDE_PLUGIN_ROOT &&
  !process.env.CURSOR_PLUGIN_ROOT &&
  Boolean(process.env.ANTIGRAVITY_AGENT || process.env.PLUGIN_ROOT || process.env.PLUGIN_DATA);
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
  if (event) void postToServer(hubProjectOf(project), '/api/agent/event', event);
});
