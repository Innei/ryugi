'use strict';

const { eventFrom, postToServer, readStdin } = require('../skills/artifacts/app/agent-event.cjs');

const at = Date.now();
const project = process.argv[2];
if (project) {
  const event = eventFrom(readStdin(), 'claude', at);
  if (event) void postToServer(project, '/api/agent/event', event);
  void postToServer(project, '/api/cloud/flush');
}
