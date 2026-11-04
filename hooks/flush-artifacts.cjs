'use strict';

const { postToServer } = require('../skills/artifacts/app/agent-stop.cjs');

const project = process.argv[2];
if (project) {
  void postToServer(project, '/api/agent/stop');
  void postToServer(project, '/api/cloud/flush');
}
