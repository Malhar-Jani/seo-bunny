const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const load = require('./load-ts.cjs');
const { rankMetrics, scanSummary, captureStatus } = load('src/lib/rank-metrics.ts');
const { localAccessError } = load('src/lib/local-access.ts');
const { shareableReport } = load('src/lib/share-export.ts');
const point = (rank, captureStatus='CHECKED', lat=1, lng=1) => ({rank,captureStatus,lat,lng,topResults:'[]'});

test('failed and ambiguous legacy captures cannot lower rank coverage; checked not-found still counts', () => {
    const metrics = rankMetrics([point(1),point(null),point(null,'FAILED'),point(null,'UNKNOWN')]);
    assert.equal(metrics.checked,2); assert.equal(metrics.top3Percent,50); assert.equal(metrics.averageRank,1);
    assert.equal(metrics.failed,1); assert.equal(metrics.unknown,1);
    assert.equal(captureStatus({rank:null,topResults:'[]'}),'UNKNOWN');
    assert.equal(captureStatus({rank:null,topResults:'[{"name":"Other business"}]'}),'CHECKED');
    assert.equal(rankMetrics([point(null,'FAILED')]).top3Percent,null);
});
test('movement compares only verified matching coordinates and never invents a prior run', () => {
    const before=[point(6,'CHECKED',1,1),point(1,'CHECKED',2,2),point(1,'CHECKED',9,9)];
    const after=[point(1,'CHECKED',1,1),point(null,'FAILED',2,2),point(1,'CHECKED',7,7)];
    assert.equal(scanSummary(after,before).change,100);
    assert.equal(scanSummary(after,before).matchedPoints,1);
    assert.equal(scanSummary(after).change,null);
});
test('API guard rejects rebinding, external reads, and mutations without an exact local origin', () => {
    const req = (method='GET',headers={},url='http://127.0.0.1:3210/api/settings') => new Request(url,{method,headers:{host:'127.0.0.1:3210',...headers}});
    assert.equal(localAccessError(req()),null);
    assert.equal(localAccessError(req('POST',{origin:'http://127.0.0.1:3210'})),null);
    assert.ok(localAccessError(req('POST')));
    assert.ok(localAccessError(req('DELETE',{origin:'https://evil.example'})));
    assert.ok(localAccessError(req('GET',{host:'evil.example:3210'})));
    assert.ok(localAccessError(req('GET',{'sec-fetch-site':'cross-site'})));
    assert.equal(localAccessError(req('GET',{'sec-fetch-site':'cross-site'},'http://127.0.0.1:3210/api/gbp/callback')),null);
    assert.equal(localAccessError(req('POST',{host:'localhost:3210',origin:'http://localhost:3210'})),null);
});
test('shareable report never includes contacts, review text, proxy credentials, settings, or nested secrets', () => {
    const serialized=JSON.stringify(shareableReport([{keyword:'test',notes:'private-note',contacts:[{phone:'private-phone'}],settings:{token:'private-token'},results:[{...point(1),captureError:'private-error',topResults:'private-review',password:'private-password'}]}]));
    assert.ok(!serialized.includes('private-')); assert.ok(serialized.includes('"rank":1'));
    assert.ok(!serialized.includes('backup'));
});

let db, directory;
before(async()=>{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'seo-bunny-release-')); const filename=path.join(directory,'test.db'); fs.closeSync(fs.openSync(filename,'wx'));
    const url='file:'+filename.replaceAll('\\','/');
    const prepared=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','push','--skip-generate'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});
    assert.equal(prepared.status,0,prepared.stdout+prepared.stderr); db=new PrismaClient({datasourceUrl:url});
});
after(async()=>{await db?.$disconnect(); fs.rmSync(directory,{recursive:true,force:true});});
test('failed-point retry preserves the original run and carries checked captures into a new run once', async()=>{
    const scan=await db.scan.create({data:{keyword:'test',centerLat:1,centerLng:1,radius:1,status:'COMPLETED',currentRunId:'old-run'}});
    for(const [rank,status,lat] of [[1,'CHECKED',1],[null,'FAILED',2]]) await db.result.create({data:{scanId:scan.id,runId:'old-run',lat,lng:1,rank,captureStatus:status,topResults:'[]'}});
    let calls=0;
    const api=load('src/app/api/scans/[id]/retry-failed/route.ts',{'@/lib/prisma':{prisma:db},'@/lib/scanQueue':{isScanActive:()=>false,enqueueScan:()=>calls++}});
    const invoke=()=>api.POST(new Request('http://localhost/retry',{method:'POST'}),{params:Promise.resolve({id:scan.id})});
    const response=await invoke(); assert.equal(response.status,200); const result=await response.json();
    assert.equal(result.retryCount,1); assert.equal(await db.result.count({where:{runId:'old-run'}}),2);
    assert.equal(await db.result.count({where:{runId:result.runId,captureStatus:'CHECKED'}}),1);
    assert.equal(await db.result.count({where:{runId:result.runId,captureStatus:'FAILED'}}),0);
    assert.equal((await invoke()).status,409); assert.equal(calls,1);
});
test('proxy listing and creation never return the stored password', async()=>{
    const api=load('src/app/api/proxies/route.ts',{'@/lib/prisma':{prisma:db},'@/lib/logger':{logger:{error(){},info(){}}}});
    const response=await api.POST(new Request('http://localhost/api/proxies',{method:'POST',body:JSON.stringify({host:'127.0.0.1',port:8080,password:'test-private-password'})}));
    const data=await response.json(); assert.equal(data.hasPassword,true); assert.equal(data.password,undefined);
    assert.ok(!JSON.stringify(await (await api.GET()).json()).includes('test-private-password'));
});
test('new scans reject missing, out-of-range, and oversized custom coordinates without launching work', async()=>{
    const api=load('src/app/api/scans/route.ts',{'@/lib/prisma':{prisma:db},'@/lib/scanQueue':{enqueueScan(){throw Error('must not run')}},'@/lib/logger':{logger:{error(){},info(){}}}});
    for(const body of [{keyword:'test'},{keyword:'test',lat:91,lng:1},{keyword:'test',lat:1,lng:1,customPoints:Array(226).fill({lat:1,lng:1})}]) {
        assert.equal((await api.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify(body)}))).status,400);
    }
});
test('scanner stores failed capture separately, resumes verified points, and records successful not-found checks', async()=>{
    let scrapeCalls=0;
    const browser={newContext:async()=>({clearCookies:async()=>{},newPage:async()=>({evaluate:async()=>{}}),close:async()=>{}}),close:async()=>{}};
    const api=load('src/lib/scanner.ts',{
        './prisma':{prisma:db}, './browser':{launchChromium:async()=>browser,getElectronLaunchDefaults:()=>({})},
        './scraper':{scrapeGMB:async()=>{scrapeCalls++;throw Error('Simulated connection failure');}},
        './logger':{logger:{debug:async()=>{},info:async()=>{},warn:async()=>{},error:async()=>{}}},
        './webhookDispatcher':{dispatchWebhook:async()=>{}},__setTimeout:fn=>setTimeout(fn,0),
    });
    const scan=await db.scan.create({data:{keyword:'test',centerLat:1,centerLng:1,radius:1,gridSize:1,status:'PENDING',currentRunId:'scanner-test',customPoints:JSON.stringify([{lat:1,lng:1},{lat:2,lng:1}])}});
    await db.result.create({data:{scanId:scan.id,runId:'scanner-test',lat:1,lng:1,rank:2,captureStatus:'CHECKED',topResults:'[]'}});
    await api.runScan(scan.id);
    const rows=await db.result.findMany({where:{scanId:scan.id}});
    assert.equal(rows.length,2);assert.equal(scrapeCalls,3);assert.equal(rows.find(r=>r.lat===2).captureStatus,'FAILED');
    assert.equal(rankMetrics(rows).top3Percent,100);
    const good=load('src/lib/scanner.ts',{
        './prisma':{prisma:db},'./browser':{launchChromium:async()=>browser,getElectronLaunchDefaults:()=>({})},
        './scraper':{scrapeGMB:async()=>[{name:'Other business',rank:1}]},
        './logger':{logger:{debug:async()=>{},info:async()=>{},warn:async()=>{},error:async()=>{}}},
        './webhookDispatcher':{dispatchWebhook:async()=>{}},__setTimeout:fn=>setTimeout(fn,0),
    });
    const second=await db.scan.create({data:{keyword:'test',businessName:'Missing target',centerLat:1,centerLng:1,radius:1,gridSize:1,status:'PENDING',customPoints:'[{"lat":1,"lng":1}]'}});
    await good.runScan(second.id);
    const captured=await db.result.findFirst({where:{scanId:second.id}});
    assert.equal(captured.captureStatus,'CHECKED');assert.equal(captured.rank,null);assert.equal(rankMetrics([captured]).top3Percent,0);
});
test('desktop SQLite setup creates its schema and applies additive upgrades without a native addon', () => {
    const {DatabaseSync}=require('node:sqlite');
    const filename=path.join(directory,'desktop.db');fs.closeSync(fs.openSync(filename,'wx'));
    const setup=load('electron/db-setup.ts',{'./paths':{getDatabasePath:()=>filename,isPackaged:()=>true}});
    setup.setupDatabase();
    let connection=new DatabaseSync(filename);
    connection.exec('INSERT INTO "GlobalSetting" (id,key,value) VALUES (\'keep\',\'private-setting\',\'preserve-me\')');
    connection.exec('ALTER TABLE "Result" DROP COLUMN captureStatus');
    connection.exec('ALTER TABLE "Result" DROP COLUMN captureError');connection.close();
    setup.setupDatabase();
    connection=new DatabaseSync(filename);
    assert.equal(connection.prepare('SELECT value FROM GlobalSetting WHERE id=?').get('keep').value,'preserve-me');
    assert.ok(connection.prepare('PRAGMA table_info("Result")').all().some(c=>c.name==='captureStatus'));
    connection.close();
});
test('business selection scopes scans, reviews and dashboard without inferring ownership by name', async()=>{
    const first=await db.savedBusiness.create({data:{name:'Scope A'}}),second=await db.savedBusiness.create({data:{name:'Scope B'}});
    for(const b of [first,second]) {
        await db.scan.create({data:{keyword:'scope test',businessName:'Same display name',savedBusinessId:b.id,centerLat:1,centerLng:1,radius:1,status:'COMPLETED'}});
        await db.reviewAnalysis.create({data:{businessName:b.name,savedBusinessId:b.id,businessUrl:'https://www.google.com/maps/place/example',status:'PENDING'}});
    }
    const overrides={'@/lib/prisma':{prisma:db},'@/lib/scanQueue':{enqueueScan(){}},'@/lib/reviewJobs':{queueReview(){}},'@/lib/logger':{logger:{error(){}}}};
    const req=new Request('http://127.0.0.1:3210/api/scans?businessId='+first.id);
    const scans=await (await load('src/app/api/scans/route.ts',overrides).GET(req)).json();
    assert.equal(scans.scans.length,1);assert.equal(scans.scans[0].savedBusinessId,first.id);
    const reviews=await (await load('src/app/api/reviews/route.ts',overrides).GET(req)).json();
    assert.equal(reviews.length,1);assert.equal(reviews[0].savedBusinessId,first.id);
    const dashboard=await (await load('src/app/api/dashboard/route.ts',overrides).GET(req)).json();
    assert.equal(dashboard.scansCount,1);assert.deepEqual(dashboard.businesses.map(b=>b.id),[first.id]);
    assert.ok(!JSON.stringify(dashboard).includes(second.id));
});
