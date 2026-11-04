'use strict';

const { eventFrom, postToServer, readStdin } = require('../skills/artifacts/app/agent-event.cjs');

const at = Date.now();
const project = process.argv[2];
if (project) {
  void postToServer(project, '/api/cloud/flush');
  void readStdin().then((input) => {
    const event = eventFrom(input, 'claude', at);
    if (event) void postToServer(project, '/api/agent/event', event);
  });
}
