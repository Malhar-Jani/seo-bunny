// Additive upgrade only. Run with the app stopped; preserve a consistent backup.
const fs=require('node:fs'),path=require('node:path');
const {PrismaClient}=require('@prisma/client');
if(!process.env.DATABASE_URL){
 const text=fs.readFileSync(path.resolve('.env'),'utf8');
 const line=text.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
 if(!line)throw Error('DATABASE_URL is missing.');process.env.DATABASE_URL=line[1];
}
if(!process.env.DATABASE_URL.startsWith('file:'))throw Error('Only local SQLite workspaces are supported.');
const raw=process.env.DATABASE_URL.slice(5);
const filename=path.isAbsolute(raw)?raw:path.resolve(__dirname,'../prisma',raw);
if(!fs.existsSync(filename))throw Error('The configured SQLite workspace does not exist.');
const db=new PrismaClient({datasourceUrl:'file:'+filename.replaceAll('\\','/')});
(async()=>{
 const columns=await db.$queryRawUnsafe('PRAGMA table_info("Result")');
 if(!columns.length)throw Error('Initialize this workspace with npm run setup:local first.');
 const additions=[['captureStatus',"TEXT NOT NULL DEFAULT 'UNKNOWN'"],['captureError','TEXT']].filter(([name])=>!columns.some(c=>c.name===name));
 if(!additions.length){console.log('Workspace is already up to date.');return;}
 const dir=path.resolve('.local-backups');fs.mkdirSync(dir,{recursive:true});
 const backup=path.join(dir,`before-2.1-${Date.now()}.db`);
 await db.$executeRawUnsafe(`VACUUM INTO '${backup.replaceAll("'","''")}'`);
 await db.$transaction(async tx=>{for(const [name,type] of additions)await tx.$executeRawUnsafe(`ALTER TABLE "Result" ADD COLUMN "${name}" ${type}`)});
 console.log('Added capture fields. Recovery copy saved in .local-backups (keep it private).');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
