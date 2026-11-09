// Generate the packaged SQLite creation statements from the canonical Prisma schema.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8' });
if (result.status) throw Error(result.stderr);
const sql = result.stdout.replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ').replace(/CREATE UNIQUE INDEX /g, 'CREATE UNIQUE INDEX IF NOT EXISTS ').replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ');
const filename = 'electron/db-setup.ts';
const source = fs.readFileSync(filename, 'utf8');
fs.writeFileSync(filename, source.replace(/const SCHEMA_SQL = `[\s\S]*?`;/, 'const SCHEMA_SQL = `\n' + sql + '`;'));
console.log('Desktop schema synchronized with Prisma.');
