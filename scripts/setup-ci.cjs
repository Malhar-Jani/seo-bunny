// CI gets an empty disposable database; never point builds at a user's workspace.
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
if (!process.env.DATABASE_URL?.startsWith('file:')) throw Error('Set DATABASE_URL to a disposable absolute SQLite filename.');
const filename = process.env.DATABASE_URL.slice(5);
if (!path.isAbsolute(filename)) throw Error('Use an absolute SQLite filename for CI.');
fs.mkdirSync(path.dirname(filename), {recursive:true});
if (!fs.existsSync(filename)) fs.closeSync(fs.openSync(filename,'wx'));
const result = spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','push','--skip-generate'],{stdio:'inherit',env:process.env});
process.exit(result.status || 0);
