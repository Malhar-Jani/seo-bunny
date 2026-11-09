const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (!fs.existsSync(envFile)) fs.copyFileSync(path.join(root, '.env.example'), envFile);
// Prisma 5 on Windows may report an empty schema-engine error for an absent file.
const database = path.join(root, 'prisma', 'dev.db');
if (!fs.existsSync(database)) fs.closeSync(fs.openSync(database, 'wx'));

for (const [script, args] of [
  [require.resolve('prisma/build/index.js'), ['db', 'push', '--skip-generate']],
  [path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'), ['install', 'chromium']],
]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Ready. Open Start SEO Bunny.cmd, then http://127.0.0.1:3210.');
