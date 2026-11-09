const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
function loadTs(filename, overrides = {}, cache = new Map()) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = request => {
        if (Object.hasOwn(overrides, request)) return overrides[request];
        const target = request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        if ((request.startsWith('.') || request.startsWith('@/')) && fs.existsSync(target + '.ts')) return loadTs(target + '.ts', overrides, cache);
        return require(require.resolve(request, { paths: [path.dirname(filename)] }));
    };
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
    return module.exports;
}
let db, growth, security, route, backup, profiles, clientA, clientB, replies = 0, posts = 0;
let mode = 'ok', liveReply = '';
const originalFetch = global.fetch;
const reviews = [
    { reviewId: 'review-1', reviewer: { displayName: 'One' }, starRating: 'FIVE', comment: 'Official cached review text', createTime: '2026-10-01T10:00:00Z' },
    { reviewId: 'review-2', reviewer: { displayName: 'Two' }, starRating: 'ONE', comment: 'Please call me' },
];
before(async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-growth-'));
    process.env.GBP_PRIVATE_DIR = path.join(temp, 'private');
    const filename = path.join(temp, 'test.db');
    fs.closeSync(fs.openSync(filename, 'wx'));
    const url = 'file:' + filename.replaceAll('\\', '/');
    const pushed = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
    assert.equal(pushed.status, 0, pushed.stdout + pushed.stderr);
    db = new PrismaClient({ datasourceUrl: url });
    const oauth = { accessToken: async () => {
        const connection = await db.googleConnection.findUnique({ where: { id: 'local' } });
        if (!connection) throw new security.GbpError('NOT_CONNECTED', 'Connect Google first.', 401);
        return { token: 'private-test-token', subject: connection.subject };
    } };
    const overrides = { './prisma': { prisma: db }, '../prisma': { prisma: db }, '@/lib/prisma': { prisma: db }, './oauth': oauth };
    const cache = new Map();
    security = loadTs('src/lib/gbp/security.ts', overrides, cache);
    growth = loadTs('src/lib/growth.ts', overrides, cache);
    profiles = loadTs('src/lib/gbp/businesses.ts', overrides, cache);
    route = loadTs('src/app/api/growth/route.ts', overrides, cache);
    backup = loadTs('src/app/api/system/backup/route.ts', overrides, cache);
    clientA = await db.savedBusiness.create({ data: { name: 'Client A', placeId: 'ChIJabc123', googleUrl: 'https://maps.app.goo.gl/example' } });
    clientB = await db.savedBusiness.create({ data: { name: 'Client B' } });
    await db.googleConnection.create({ data: { id: 'local', clientId: 'test', subject: 'owner', email: 'manager@example.test', refreshEncrypted: 'test', accessEncrypted: 'test', expiresAt: new Date(), scopes: 'test' } });
    await db.googleBusinessLink.create({ data: { businessId: clientA.id, subject: 'owner', accountName: 'accounts/1', locationName: 'locations/10' } });
    global.fetch = async (input, options) => {
        const url = new URL(input);
        assert.equal(url.origin, 'https://mybusiness.googleapis.com'); assert.equal(options.headers.Authorization, 'Bearer private-test-token');
        if (options.method === 'PUT') { replies++; const data = JSON.parse(options.body); liveReply = data.comment; return Response.json({ comment: liveReply }); }
        if (options.method === 'POST') {
            posts++;
            const data = JSON.parse(options.body); assert.equal(data.topicType, 'STANDARD'); assert.equal(data.languageCode, 'en');
            if (mode === 'timeout') throw Error('private upstream error');
            if (mode === 'reject') return Response.json({ error: { message: 'private upstream error' } }, { status: 400 });
            return Response.json({ name: 'accounts/1/locations/10/localPosts/post-1', state: 'LIVE' });
        }
        if (url.pathname.endsWith('/reviews')) {
            if (mode === 'sync-fail') return Response.json({ error: { message: 'private upstream error' } }, { status: 500 });
            return Response.json({ reviews: url.searchParams.has('pageToken') ? [reviews[1]] : [{ ...reviews[0], ...(liveReply ? { reviewReply: { comment: liveReply } } : {}) }], totalReviewCount: 2, averageRating: 3, ...(url.searchParams.has('pageToken') ? {} : { nextPageToken: 'page-two' }) });
        }
        return Response.json({ ...reviews[0], ...(liveReply ? { reviewReply: { comment: liveReply } } : {}) });
    };
});
after(async () => { global.fetch = originalFetch; await db?.$disconnect(); delete process.env.GBP_PRIVATE_DIR; });
function request(body, origin = 'http://127.0.0.1:3210') {
    return new Request('http://127.0.0.1:3210/api/growth', { method: 'POST', headers: { host: '127.0.0.1:3210', origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const postData = { title: 'Our hours', summary: 'We are open on Sunday.', actionType: 'BOOK', actionUrl: 'https://example.com/book' };

test('official sync paginates, encrypts cached reviews, and a failed refresh preserves the previous collection', async () => {
    assert.deepEqual(await growth.syncReviews(clientA.id), { count: 2, complete: true });
    const cache = await db.googleReviewCache.findUnique({ where: { businessId: clientA.id } });
    assert.ok(!cache.contentEncrypted.includes('Official cached review text')); assert.ok(cache.expiresAt > new Date());
    const inbox = await growth.inbox(clientA.id); assert.equal(inbox.source, 'GOOGLE'); assert.equal(inbox.reviews.length, 2); assert.equal(inbox.reviews[1].rating, 1);
    mode = 'sync-fail'; await assert.rejects(growth.syncReviews(clientA.id), e => !e.message.includes('private upstream')); mode = 'ok';
    assert.equal((await growth.inbox(clientA.id)).reviews.length, 2);
});
test('local drafts and contacts are isolated by business; external origins cannot mutate the workspace', async () => {
    const p = await growth.savePost(clientA.id, postData);
    await assert.rejects(growth.savePost(clientB.id, { ...postData, id: p.id, updatedAt: p.updatedAt.toISOString() }), /already sent|being sent/);
    const bad = await route.POST(request({ businessId: clientA.id, action: 'saveContact', name: 'Private contact', stage: 'NEW' }, 'https://evil.test'));
    assert.equal(bad.status, 403);
    const contact = await route.POST(request({ businessId: clientA.id, action: 'saveContact', name: 'Local contact', phone: '+919999999999', stage: 'NEW' }));
    assert.equal(contact.status, 200); assert.equal((await contact.json()).permission, false);
    assert.equal(await db.businessContact.count({ where: { businessId: clientB.id } }), 0);
});
test('review replies require exact draft approval, official reviews, a current Google reply, and one atomic delivery claim', async () => {
    let draft = await growth.saveReply(clientA.id, { reviewKey: 'google:review-1', comment: 'Thank you for the feedback.' });
    const approved = () => ({ id: draft.id, version: draft.updatedAt.toISOString(), approved: true });
    await assert.rejects(growth.publishReply(clientA.id, { ...approved(), approved: false }), /approve/);
    await assert.rejects(growth.publishReply(clientA.id, { ...approved(), version: new Date(0).toISOString() }), /changed/);
    liveReply = 'A reply entered directly on Google';
    await assert.rejects(growth.publishReply(clientA.id, approved()), /Someone changed/); assert.equal(replies, 0);
    liveReply = '';
    draft = await db.replyDraft.findUnique({ where: { id: draft.id } });
    const outcome = await Promise.allSettled([growth.publishReply(clientA.id, approved()), growth.publishReply(clientA.id, approved())]);
    assert.equal(outcome.filter(r => r.status === 'fulfilled').length, 1); assert.equal(replies, 1);
    assert.equal((await db.replyDraft.findUnique({ where: { id: draft.id } })).status, 'PUBLISHED');
    await assert.rejects(growth.saveReply(clientA.id, { reviewKey: 'google:review-1', comment: 'Old tab overwrite', version: draft.updatedAt.toISOString() }), /changed/);
});
test('posts publish the approved version once; edited posts and switched business links invalidate approvals', async () => {
    const p = await growth.savePost(clientA.id, postData);
    const updated = await growth.savePost(clientA.id, { ...postData, id: p.id, updatedAt: p.updatedAt.toISOString(), summary: 'Updated hours.' });
    await assert.rejects(growth.approvePost(clientA.id, { id: p.id, version: p.updatedAt.toISOString(), approved: true }), /changed|scheduled/);
    await growth.approvePost(clientA.id, { id: p.id, version: updated.updatedAt.toISOString(), approved: true, scheduledAt: new Date(Date.now() + 120000).toISOString() });
    await db.businessPost.update({ where: { id: p.id }, data: { scheduledAt: new Date(0) } });
    const before = posts;
    await Promise.all([growth.publishPost(p.id), growth.publishPost(p.id)]);
    assert.equal(posts, before + 1); assert.equal((await db.businessPost.findUnique({ where: { id: p.id } })).status, 'SUBMITTED');
    const second = await growth.savePost(clientA.id, postData);
    await growth.approvePost(clientA.id, { id: second.id, version: second.updatedAt.toISOString(), approved: true, scheduledAt: new Date(Date.now() + 120000).toISOString() });
    await db.businessPost.update({ where: { id: second.id }, data: { scheduledAt: new Date(0), approvedSubject: 'different-owner' } });
    await growth.runScheduledPosts(); assert.equal(posts, before + 1);
    assert.equal((await db.businessPost.findUnique({ where: { id: second.id } })).status, 'FAILED');
});
test('unknown post delivery is never retried by the scheduler; restart marks interrupted deliveries for manual checking', async () => {
    const p = await growth.savePost(clientA.id, postData); mode = 'timeout'; const before = posts;
    await assert.rejects(growth.approvePost(clientA.id, { id: p.id, version: p.updatedAt.toISOString(), approved: true }), /did not confirm/);
    assert.equal((await db.businessPost.findUnique({ where: { id: p.id } })).status, 'CHECK_GOOGLE');
    mode = 'ok'; await growth.runScheduledPosts(); assert.equal(posts, before + 1);
    await db.businessPost.update({ where: { id: p.id }, data: { status: 'PUBLISHING' } });
    await growth.recoverPublishing(); assert.equal((await db.businessPost.findUnique({ where: { id: p.id } })).status, 'CHECK_GOOGLE');
});
test('review QR destinations and post links reject unsafe addresses; template replies make no treatment claims', () => {
    assert.equal(growth.reviewLink(clientA), 'https://search.google.com/local/writereview?placeid=ChIJabc123');
    assert.equal(growth.reviewLink({ googleUrl: 'https://evil.test' }), null);
    assert.equal(growth.reviewLink({ googleUrl: 'javascript:alert(1)' }), null);
    for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://127.0.0.1', 'https://192.168.1.2', 'https://test.local']) assert.throws(() => growth.postInput({ ...postData, imageUrl: url }));
    assert.throws(() => growth.postInput({ ...postData, summary: 'x'.repeat(1501) }));
    for (const rating of [1, 3, 5]) assert.doesNotMatch(growth.replySuggestion(rating), /patient|treatment|diagnosis|appointment/);
});
test('backups retain authored work without cached Google content; restore cancels publication approvals', async () => {
    const draft = await growth.savePost(clientA.id, postData);
    await growth.approvePost(clientA.id, { id: draft.id, version: draft.updatedAt.toISOString(), approved: true, scheduledAt: new Date(Date.now() + 120000).toISOString() });
    const saved = await backup.GET(); const content = await saved.text();
    assert.ok(!content.includes('Official cached review text')); assert.ok(!content.includes('contentEncrypted')); assert.ok(!content.includes('private-test-token'));
    assert.ok(content.includes('Local contact')); assert.ok(content.includes('Our hours'));
    const response = await backup.POST(new Request('http://127.0.0.1:3210/api/system/backup', { method: 'POST', body: content }));
    assert.equal(response.status, 200); assert.equal(await db.googleReviewCache.count(), 0);
    const restored = await db.businessPost.findUnique({ where: { id: draft.id } }); assert.equal(restored.status, 'DRAFT'); assert.equal(restored.approvedAt, null);
});
test('expired Google reviews are neither displayed nor retained after housekeeping', async () => {
    liveReply = ''; await growth.syncReviews(clientA.id);
    await db.googleReviewCache.update({ where: { businessId: clientA.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await growth.inbox(clientA.id)).reviews.length, 0);
    await profiles.purgeGoogleCache(); assert.equal(await db.googleReviewCache.count(), 0);
});
