// npm run test:ui  (needs MongoDB running: `docker compose up -d` from the project root)
// Starts a throwaway copy of the API on port 5055 with demo data, drives the real React app against it
// in a simulated browser (jsdom), then shuts everything down. Your normal database is not touched.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverDir = path.resolve('..', 'server');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-ui-'));
const env = {
  ...process.env,
  MONGO_URI: process.env.MONGO_URI_UITEST || 'mongodb://localhost:27017/lms_uitest',
  JWT_SECRET: 'ui-test-secret', STORAGE_DRIVER: 'local',
  STORAGE_DIR: path.join(tmp, 'storage'), TMP_DIR: path.join(tmp, 'tmp'),
  PORT: '5055', CLIENT_URL: 'http://localhost:5173', PUBLIC_API_URL: 'http://localhost:5055',
};

const run = (args) => spawnSync(process.execPath, args, { cwd: serverDir, env, stdio: 'inherit' });
run(['-e', "require('mongoose').connect(process.env.MONGO_URI).then(async (m) => { await m.connection.dropDatabase(); process.exit(0); }).catch((e) => { console.error('Cannot reach MongoDB:', e.message); process.exit(1); })"]).status === 0 || process.exit(1);
if (run(['src/scripts/seedDemo.js']).status !== 0) process.exit(1);

const server = spawn(process.execPath, ['src/server.js'], { cwd: serverDir, env, stdio: 'inherit' });
let code = 1;
try {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch('http://localhost:5055/api/health')).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  code = spawnSync(process.execPath, [path.resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.ui.config.js'], { stdio: 'inherit' }).status ?? 1;
} finally {
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
