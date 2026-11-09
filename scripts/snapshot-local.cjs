// A consistent local recovery snapshot; never copies Google's encryption key.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const directory = path.resolve('.local-backups');
fs.mkdirSync(directory, { recursive: true });
const filename = path.join(directory, `before-growth-work-${Date.now()}.sqlite`);
const db = new Database(path.resolve('prisma/dev.db'), { readonly: true });
db.exec(`VACUUM INTO '${filename.replaceAll("'", "''")}'`);
db.close();
console.log('Local recovery snapshot saved:', filename);
