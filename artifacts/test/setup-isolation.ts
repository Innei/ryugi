import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// One machine server per test file: files run in parallel, and a stop in one must not end another's server.
process.env.RYUGI_SERVER_HOME = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-test-server-')),
  'server',
);
