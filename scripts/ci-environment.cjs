// Use a file instead of shell-dependent JavaScript quoting on Windows and Linux.
const fs = require('node:fs');
const path = require('node:path');
if (!process.env.GITHUB_ENV || !process.env.RUNNER_TEMP) throw Error('GitHub runner environment is missing.');
const filename = path.join(process.env.RUNNER_TEMP, 'seo-bunny-ci.db').split(path.sep).join('/');
fs.appendFileSync(process.env.GITHUB_ENV, `DATABASE_URL=file:${filename}\nSEO_BUNNY_DISABLE_BACKGROUND=1\n`);
