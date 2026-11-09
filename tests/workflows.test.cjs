const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ts = require('typescript');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

function loadTs(filename, overrides = {}, cache = new Map()) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = request => {
        if (Object.hasOwn(overrides, request)) return overrides[request];
        const target = request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        if (request.startsWith('.') || request.startsWith('@/')) {
            if (fs.existsSync(target + '.ts')) return loadTs(target + '.ts', overrides, cache);
        }
        return require(require.resolve(request, { paths: [path.dirname(filename)] }));
    };
    new Function('require','module','exports',code)(localRequire,module,module.exports);
    return module.exports;
}
const policy = loadTs('src/lib/reviewPolicy.ts');
const sentiment = loadTs('src/lib/sentimentEngine.ts');
let db, jobs, tempDir;
let mode = 'partial';
const sample = [
    {reviewId:'a',reviewerName:'A',rating:1,text:'Very rude staff and poor service',publishedDate:'a week ago'},
    {reviewId:'b',reviewerName:'B',rating:5,text:'Friendly staff and excellent service',publishedDate:'a month ago'},
    {reviewId:'c',reviewerName:'C',rating:4,text:'ખૂબ સારી સેવા',publishedDate:'a month ago'},
];
const waitFor = async predicate => { for(let i=0;i<150;i++){ const result=await predicate();if(result)return result;await new Promise(r=>setTimeout(r,25)); } throw Error('Timed out waiting for job'); };
before(async()=>{
    tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'seotracker-tests-'));
    const database=path.join(tempDir,'test.db'); fs.closeSync(fs.openSync(database,'wx'));
    const url='file:'+database.replaceAll('\\','/');
    const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','push','--skip-generate'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});
    assert.equal(result.status,0,result.stdout+result.stderr);
    db=new PrismaClient({datasourceUrl:url});
    const fakeScrape=async(_url,progress,signal)=>{
        progress('Collecting test reviews');
        if(mode==='hold') return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Collection cancelled.')),{once:true}));
        return { business:{name:'Test business',totalReviews:mode==='partial'?10:3,averageRating:3.3}, reviews:[...sample,sample[0]] };
    };
    jobs=loadTs('src/lib/reviewJobs.ts',{'./prisma':{prisma:db},'./reviewScraper':{scrapeGoogleReviews:fakeScrape}});
});
after(async()=>{await db?.$disconnect();});

test('coverage never calls unknown or incomplete totals complete',()=>{
    assert.deepEqual(policy.collectionCoverage(3,10),{collected:3,expected:10,complete:false,percent:30});
    assert.equal(policy.collectionCoverage(3,3).complete,true);
    assert.equal(policy.collectionCoverage(3,0).complete,false);
    assert.equal(policy.collectionCoverage(3,0).percent,null);
});
test('dedup keeps distinct review IDs and does not merge by short text prefixes',()=>{
    assert.equal(policy.deduplicateReviewCollection([...sample,sample[0]]).length,3);
    assert.equal(policy.deduplicateReviewCollection([{...sample[0],reviewId:'x'},{...sample[0],reviewId:'y'}]).length,2);
});
test('Hindi/Gujarati are explicitly unassessed instead of neutral or rating-derived sentiment',()=>{
    assert.equal(sentiment.analyzeSentiment('ખૂબ સારી સેવા',5).label,'NOT_ASSESSED');
    assert.equal(sentiment.analyzeSentiment('बहुत खराब सेवा',1).confidence,0);
    assert.equal(sentiment.analyzeSentiment('Friendly staff and excellent service',5).label,'POSITIVE');
});
test('Maps URLs reject arbitrary sites, credentials, custom ports and non-HTTPS links',()=>{
    assert.match(policy.validateMapsUrl('https://maps.app.goo.gl/abc'),/^https:/);
    for(const url of ['http://google.com/maps','https://google.com.evil.test/maps','https://user:pass@google.com/maps','https://google.com:8080/maps','file:///test']) assert.throws(()=>policy.validateMapsUrl(url));
});
test('partial and complete jobs save coverage and separate immutable run snapshots',async()=>{
    const analysis=await db.reviewAnalysis.create({data:{businessName:'Test business',businessUrl:'https://www.google.com/maps/place/test',status:'PENDING'}});
    await jobs.queueReview(analysis.id);
    await waitFor(async()=>{const a=await db.reviewAnalysis.findUnique({where:{id:analysis.id}});return a.status==='PARTIAL'&&a});
    const partial=await db.reviewAnalysis.findUnique({where:{id:analysis.id}});
    assert.equal(partial.collectedReviews,3); assert.equal(partial.collectionComplete,false);
    assert.equal(await db.review.count({where:{analysisId:analysis.id}}),3);
    assert.equal(await db.reviewRun.count({where:{analysisId:analysis.id}}),1);
    mode='complete'; await jobs.queueReview(analysis.id);
    const complete=await waitFor(async()=>{const a=await db.reviewAnalysis.findUnique({where:{id:analysis.id}});return a.status==='COMPLETED'&&a});
    assert.equal(complete.collectionComplete,true);
    assert.notEqual(complete.currentRunId,partial.currentRunId);
    assert.equal(await db.review.count({where:{analysisId:analysis.id}}),6);
    assert.equal((await db.reviewRun.findUnique({where:{id:partial.currentRunId}})).collectionComplete,false);
});
test('duplicate retries are rejected, active cancellation closes work, last report survives',async()=>{
    mode='hold';
    const analysis=await db.reviewAnalysis.findFirst({where:{status:'COMPLETED'}});
    await jobs.queueReview(analysis.id);
    await waitFor(async()=> (await db.reviewAnalysis.findUnique({where:{id:analysis.id}})).status==='SCRAPING');
    await assert.rejects(()=>jobs.queueReview(analysis.id));
    await jobs.cancelReview(analysis.id);
    const cancelled=await waitFor(async()=>{const a=await db.reviewAnalysis.findUnique({where:{id:analysis.id}});return a.status==='CANCELLED'&&a});
    assert.equal(cancelled.currentRunId,analysis.currentRunId);
    assert.equal(cancelled.analysisData,analysis.analysisData);
});
test('queued cancellation is durable and startup marks interrupted jobs recoverable',async()=>{
    const a=await db.reviewAnalysis.create({data:{businessName:'Queued',businessUrl:'https://google.com/maps',status:'QUEUED',job:{create:{}}}});
    await jobs.cancelReview(a.id);
    assert.equal((await db.reviewJob.findUnique({where:{analysisId:a.id}})).status,'CANCELLED');
    const b=await db.reviewAnalysis.create({data:{businessName:'Interrupted',businessUrl:'https://google.com/maps',status:'SCRAPING',job:{create:{status:'SCRAPING'}}}});
    await jobs.recoverReviewJobs();
    assert.equal((await db.reviewAnalysis.findUnique({where:{id:b.id}})).status,'INTERRUPTED');
});

test('report API handles SQLite timestamps and returns each historical run’s own coverage',async()=>{
    const api=loadTs('src/app/api/reviews/[id]/route.ts',{'@/lib/prisma':{prisma:db},'@/lib/logger':{logger:{error:()=>{}}}});
    const analysis=await db.reviewAnalysis.findFirst({where:{businessName:'Test business'}});
    const runs=await db.reviewRun.findMany({where:{analysisId:analysis.id},orderBy:{createdAt:'asc'}});
    const response=await api.GET(new Request('http://localhost/api/reviews/'+analysis.id+'?runId='+runs[0].id),{params:Promise.resolve({id:analysis.id})});
    const report=await response.json();assert.equal(response.status,200,JSON.stringify(report));
    assert.equal(report.collectionComplete,false);assert.equal(report.collectedReviews,3);assert.equal(report.reviews.length,3);
    assert.equal(typeof report.runs[0].runAt,'string');assert.equal(report.attention.unansweredLowRatings,1);
});
test('scheduler claims an overdue scan once without a browser page',async()=>{
    const queued=[];
    const background=loadTs('src/lib/background.ts',{'./prisma':{prisma:db},'./scanQueue':{enqueueScan:id=>queued.push(id),recoverQueue:async()=>{}},'./reviewJobs':{processReviewQueue:async()=>{},recoverReviewJobs:async()=>{}}});
    const scan=await db.scan.create({data:{keyword:'test',centerLat:23,centerLng:72,radius:1,status:'COMPLETED',frequency:'DAILY',nextRun:new Date(Date.now()-1000)}});
    await background.runScheduledScans(); await background.runScheduledScans();
    assert.deepEqual(queued,[scan.id]);
    assert.equal((await db.scan.findUnique({where:{id:scan.id}})).status,'PENDING');
});

test('backup restore is transactional, rejects bad files and saves a recovery copy',async()=>{
    const recovery=[];
    const backupApi=loadTs('src/app/api/system/backup/route.ts',{'@/lib/prisma':{prisma:db},'fs/promises':{mkdir:async()=>{},writeFile:async(_p,data)=>recovery.push(JSON.parse(data))}});
    const exportResponse=await backupApi.GET();
    const snapshot=await exportResponse.json();
    assert.equal(snapshot.format,'SEOTracker-backup');
    const blocked=await backupApi.POST(new Request('http://localhost/api/system/backup',{method:'POST',body:JSON.stringify(snapshot)}));
    assert.equal(blocked.status,409,'Cannot restore over running scans');
    await db.scan.updateMany({where:{status:'PENDING'},data:{status:'FAILED'}});
    const before=await db.review.count();
    const malformed=structuredClone(snapshot);malformed.data.review[0].rating='invalid';
    const failed=await backupApi.POST(new Request('http://localhost/api/system/backup',{method:'POST',body:JSON.stringify(malformed)}));
    assert.equal(failed.status,400);
    assert.equal(await db.review.count(),before,'Failed restore rolls the deletion back');
    const added=await db.savedBusiness.create({data:{name:'Not in the backup'}});
    const restored=await backupApi.POST(new Request('http://localhost/api/system/backup',{method:'POST',body:JSON.stringify(snapshot)}));
    assert.equal(restored.status,200,await restored.text());
    assert.equal(await db.savedBusiness.findUnique({where:{id:added.id}}),null);
    assert.equal(await db.review.count(),before);
    assert.equal(recovery.length,2);
    assert.equal((await db.scan.findFirst()).status,'FAILED','Restored jobs never auto-start');
});
