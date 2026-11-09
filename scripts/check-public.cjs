// This preflight prints filenames only. It is not a substitute for a history audit.
const fs = require('node:fs'), path = require('node:path'), {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const git=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'});
let files=[];
const excluded=new Set(['node_modules','.next','dist-electron','.local-backups','.rea','artifacts','.git','dist','data']);
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(excluded.has(e.name))continue;const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else files.push(file)}}
if(git.status===0)files=git.stdout.split('\0').filter(Boolean);else walk('');
const forbidden=/(^|[/\\])(?:\.env(?:\..+)?|[^/\\]+\.(?:db|sqlite|sqlite3)(?:-.*)?|google\.key)$/i;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{40,}\b/,/\bAIza[A-Za-z0-9_-]{30,}\b/,/\bAKIA[A-Z0-9]{16}\b/,/mongodb(?:\+srv)?:\/\/[^\s:@]+:[^\s@]+@/];
const issues=[];
for(const file of files){
 if(file.replaceAll('\\','/')==='.env.example')continue;
 if(forbidden.test(file)) {if(git.status===0)issues.push(file+' (private data file tracked)');continue;}
 if(/(^|[/\\])(?:artifacts|\.rea|\.local-backups)([/\\]|$)/.test(file)){issues.push(file+' (private workspace material tracked)');continue;}
 const absolute=path.join(root,file);if(!fs.existsSync(absolute)||fs.statSync(absolute).size>5e6)continue;
 if(!/\.(?:tsx?|jsx?|cjs|mjs|md|json|ya?ml|txt|cmd|html|css)$/.test(file))continue;
 const text=fs.readFileSync(absolute,'utf8');if(patterns.some(p=>p.test(text)))issues.push(file+' (possible credential)');
}
if(issues.length){console.error(issues.join('\n'));process.exit(1)}
console.log(`Public-source preflight passed (${files.length} files inspected; ${git.status===0?'tracked files':'no Git metadata: source tree only'}). No history audit performed.`);
