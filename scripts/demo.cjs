// A separate disposable workspace. No access to the user's SQLite database.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'seo-bunny-demo-'));
const env={...process.env,DATABASE_URL:'file:'+path.join(directory,'demo.db').replaceAll('\\','/'),SEO_BUNNY_DISABLE_BACKGROUND:'1',SEO_BUNNY_DEMO_ONLY:'1',GBP_APP_ORIGIN:'http://127.0.0.1:3211'};
const prepared=spawnSync(process.execPath,[path.join(__dirname,'setup-ci.cjs')],{env,stdio:'inherit',windowsHide:true});
if(prepared.status)process.exit(prepared.status);
console.log('Open http://127.0.0.1:3211/demo — fictional data, separate temporary workspace.');
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3211'],{env,stdio:'inherit',windowsHide:true});
child.on('error',e=>{console.error(e.message);process.exitCode=1});
child.on('exit',code=>{process.exitCode=code||0;});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());
