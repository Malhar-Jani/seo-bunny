const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const google = require('google-auth-library');

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
let db, temp, oauth, security, businesses, routes, nonce, codeVerifier, refreshCount = 0, refreshError;
let granted = 'openid email https://www.googleapis.com/auth/business.manage';
let subject = 'manager-1';
const originalFetch = global.fetch;
const clientId = '123-example.apps.googleusercontent.com';
class FakeOAuth extends google.OAuth2Client {
    async getToken(options) {
        codeVerifier = options.codeVerifier;
        return { tokens: { access_token: 'access-very-private', refresh_token: 'refresh-very-private', id_token: 'test-id', scope: granted, expiry_date: Date.now() + 3600000 } };
    }
    async verifyIdToken() { return { getPayload: () => ({ sub: subject, email: 'manager@example.test', email_verified: true, nonce }) }; }
    async refreshAccessToken() {
        refreshCount++;
        await new Promise(resolve => setTimeout(resolve, 30));
        if (refreshError) throw refreshError;
        return { credentials: { access_token: 'refreshed-private', expiry_date: Date.now() + 3600000 } };
    }
}
before(async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-google-'));
    process.env.GBP_PRIVATE_DIR = path.join(temp, 'private');
    const file = path.join(temp, 'test.db'); fs.closeSync(fs.openSync(file, 'wx'));
    const url = 'file:' + file.replaceAll('\\', '/');
    const pushed = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
    assert.equal(pushed.status, 0, pushed.stdout + pushed.stderr);
    db = new PrismaClient({ datasourceUrl: url });
    const overrides = { '../prisma': { prisma: db }, '@/lib/prisma': { prisma: db }, 'google-auth-library': { ...google, OAuth2Client: FakeOAuth } };
    const cache = new Map();
    security = loadTs('src/lib/gbp/security.ts', overrides, cache);
    oauth = loadTs('src/lib/gbp/oauth.ts', overrides, cache);
    businesses = loadTs('src/lib/gbp/businesses.ts', overrides, cache);
    routes = {
        config: loadTs('src/app/api/gbp/config/route.ts', overrides, cache),
        callback: loadTs('src/app/api/gbp/callback/route.ts', overrides, cache),
        backup: loadTs('src/app/api/system/backup/route.ts', overrides, cache),
    };
});
after(async () => { global.fetch = originalFetch; await db?.$disconnect(); delete process.env.GBP_PRIVATE_DIR; });
async function begin() {
    const start = await oauth.beginConnection(); const url = new URL(start.url); nonce = url.searchParams.get('nonce');
    return { ...start, state: url.searchParams.get('state'), challenge: url.searchParams.get('code_challenge'), authUrl: url };
}
async function connect() {
    const start = await begin(); await oauth.finishConnection(start.state, start.browser, 'code', false); return start;
}
test('credential routes reject cross-origin, missing Origin and rebinding hosts; errors never echo secrets', async () => {
    const request = (host, origin) => new Request('http://127.0.0.1:3210/api/gbp/config', { method: 'POST', headers: { host, ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret: 'never-echo-me' }) });
    for (const req of [request('127.0.0.1:3210', 'https://evil.test'), request('127.0.0.1:3210'), request('evil.test', 'https://evil.test')]) {
        const response = await routes.config.POST(req); assert.equal(response.status, 403); assert.ok(!(await response.text()).includes('never-echo-me'));
    }
    await oauth.saveCredential(clientId, 'super-private-secret');
    const config = await db.googleCredential.findUnique({ where: { id: 'local' } });
    assert.ok(!config.secretEncrypted.includes('super-private-secret'));
    assert.equal(await security.decrypt(config.secretEncrypted), 'super-private-secret');
    const status = await oauth.connectionStatus(); assert.equal(status.configured, true); assert.equal(status.connection, null);
    assert.ok(!JSON.stringify(status).includes('Encrypted')); assert.ok(!JSON.stringify(status).includes('super-private-secret'));
    await assert.rejects(security.decrypt(config.secretEncrypted.slice(0, -3) + 'xxx'), /could not be unlocked/);
});
test('OAuth uses offline access, PKCE and a browser-bound one-time state; rejected callbacks do not consume valid state', async () => {
    const start = await begin();
    assert.equal(start.authUrl.searchParams.get('access_type'), 'offline'); assert.equal(start.authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(start.authUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:3210/api/gbp/callback');
    await assert.rejects(oauth.finishConnection(start.state, 'wrong-browser', 'code', false), /expired|already used/);
    await oauth.finishConnection(start.state, start.browser, 'code', false);
    assert.equal(crypto.createHash('sha256').update(codeVerifier).digest('base64url'), start.challenge);
    await assert.rejects(oauth.finishConnection(start.state, start.browser, 'code', false), /expired|already used/);
    const row = await db.googleConnection.findUnique({ where: { id: 'local' } });
    assert.equal(row.email, 'manager@example.test'); assert.ok(!row.refreshEncrypted.includes('refresh-very-private'));
});
test('expired requests, denied consent, changed configuration and missing scope cannot replace a connection', async () => {
    let start = await begin();
    await db.googleOAuthAttempt.update({ where: { id: security.hash(start.state) }, data: { expiresAt: new Date(0) } });
    await assert.rejects(oauth.finishConnection(start.state, start.browser, 'code', false), /expired/);
    start = await begin(); await assert.rejects(oauth.finishConnection(start.state, start.browser, null, true), /cancelled/);
    start = await begin(); await db.googleCredential.update({ where: { id: 'local' }, data: { updatedAt: new Date(Date.now() + 1000) } });
    await assert.rejects(oauth.finishConnection(start.state, start.browser, 'code', false), /settings changed/);
    start = await begin(); granted = 'openid email'; await assert.rejects(oauth.finishConnection(start.state, start.browser, 'code', false), /not granted/); granted += ' ' + security.GBP_SCOPE;
    assert.equal((await oauth.connectionStatus()).connection.email, 'manager@example.test');
});
test('concurrent refreshes share a single Google request; revoked tokens require reconnection', async () => {
    await db.googleConnection.update({ where: { id: 'local' }, data: { expiresAt: new Date(0) } });
    refreshCount = 0;
    const tokens = await Promise.all(Array.from({ length: 8 }, () => oauth.accessToken()));
    assert.equal(refreshCount, 1); assert.ok(tokens.every(t => t.token === 'refreshed-private'));
    refreshError = { response: { data: { error: 'invalid_grant' } } };
    await db.googleConnection.update({ where: { id: 'local' }, data: { expiresAt: new Date(0) } });
    await assert.rejects(oauth.accessToken(), error => error.code === 'RECONNECT'); refreshError = undefined;
    await oauth.accessToken();
});
function fakeGoogle() {
    const calls = [];
    global.fetch = async (input, options) => {
        const url = new URL(input); calls.push(url);
        assert.match(options.headers.Authorization, /^Bearer /); assert.equal(options.cache, 'no-store');
        if (url.hostname === 'mybusinessaccountmanagement.googleapis.com') return Response.json(url.searchParams.has('pageToken') ? { accounts: [{ name: 'accounts/2', accountName: 'Client group' }] } : { accounts: [{ name: 'accounts/1', accountName: 'Manager', type: 'PERSONAL' }], nextPageToken: 'next' });
        assert.equal(url.hostname, 'mybusinessbusinessinformation.googleapis.com'); assert.ok(url.searchParams.get('readMask').includes('metadata'));
        return Response.json(url.searchParams.has('pageToken') ? { locations: [{ name: 'locations/20', title: 'Second business', metadata: { placeId: 'second-place' } }] } : { locations: [{ name: 'locations/10', title: 'Client business', storefrontAddress: { addressLines: ['Road 1'], locality: 'Ahmedabad' }, latlng: { latitude: 23, longitude: 72 }, metadata: { placeId: 'existing-place', mapsUri: 'https://www.google.com/maps/place/example' } }], nextPageToken: 'next-location' });
    };
    return calls;
}
test('accounts and locations paginate; imports are idempotent, validate access and preserve local notes and names', async () => {
    const calls = fakeGoogle();
    const accounts = await businesses.listAccounts(); assert.equal(accounts.length, 2);
    assert.equal((await businesses.discoverBusinesses('accounts/1')).businesses.length, 2);
    await assert.rejects(businesses.discoverBusinesses('https://evil.test'), /Choose a Google/);
    await assert.rejects(businesses.importBusinesses('accounts/1', [{ locationName: 'locations/999', label: 'Unknown' }]), /no longer accessible/);
    const manual = await db.savedBusiness.create({ data: { name: 'My client label', notes: 'Keep my notes', placeId: 'existing-place', address: 'Manual address' } });
    const selection = [{ locationName: 'locations/10', label: 'Do not overwrite' }, { locationName: 'locations/20', label: 'My second client' }];
    assert.deepEqual(await businesses.importBusinesses('accounts/1', selection), { created: 1, linked: 1, refreshed: 0 });
    assert.deepEqual(await businesses.importBusinesses('accounts/1', selection), { created: 0, linked: 0, refreshed: 2 });
    assert.equal(await db.savedBusiness.count(), 2);
    const local = await db.savedBusiness.findUnique({ where: { id: manual.id } });
    assert.equal(local.name, 'My client label'); assert.equal(local.notes, 'Keep my notes');
    const [enriched] = await businesses.withGoogleProfiles([local]); assert.equal(enriched.address, 'Manual address'); assert.equal(enriched.lat, 23);
    assert.equal(enriched.google.localProfile.lat, null); assert.equal(enriched.google.connected, true);
    assert.ok(calls.some(c => c.searchParams.has('pageToken')));
});
test('temporary profile data expires and is purged; backups preserve mappings and exclude credentials, tokens and cached content', async () => {
    const backup = await routes.backup.GET(); const text = await backup.text(); const parsed = JSON.parse(text);
    assert.ok(!text.includes('secretEncrypted')); assert.ok(!text.includes('refreshEncrypted')); assert.ok(!text.includes('access-very-private'));
    assert.ok(!text.includes('profileEncrypted')); assert.equal(parsed.data.googleBusinessLink.length, 2);
    assert.ok(!text.includes('https://www.google.com/maps/place/example'));
    const restored = await routes.backup.POST(new Request('http://127.0.0.1/api/system/backup', { method: 'POST', body: text }));
    assert.equal(restored.status, 200); assert.equal(await db.googleBusinessLink.count(), 2);
    assert.equal(await db.googleBusinessLink.count({ where: { profileEncrypted: { not: null } } }), 0);
    assert.equal((await oauth.connectionStatus()).connection.email, 'manager@example.test');
    fakeGoogle(); await businesses.importBusinesses('accounts/1', [{ locationName: 'locations/10', label: 'Client' }]);
    assert.equal(await db.googleBusinessLink.count({ where: { profileEncrypted: { not: null } } }), 1);
    await db.googleBusinessLink.updateMany({ data: { profileExpiresAt: new Date(0) } });
    const rows = await db.savedBusiness.findMany(); const enriched = await businesses.withGoogleProfiles(rows);
    assert.ok(enriched.every(b => b.google.needsRefresh)); assert.ok(enriched.every(b => b.lat == null));
    await businesses.purgeGoogleCache(); assert.equal(await db.googleBusinessLink.count({ where: { profileEncrypted: { not: null } } }), 0);
    fakeGoogle(); await businesses.importBusinesses('accounts/1', [{ locationName: 'locations/10', label: 'Client' }]);
    await oauth.disconnect(); assert.equal((await oauth.connectionStatus()).connection, null);
    assert.equal(await db.googleBusinessLink.count({ where: { profileEncrypted: { not: null } } }), 0); assert.equal(await db.savedBusiness.count(), 2);
});
test('Google API failures are actionable and do not echo raw response bodies or bearer tokens', async () => {
    await connect();
    for (const [status, reason, expected] of [[403, 'SERVICE_DISABLED', 'API_DISABLED'], [403, 'ACCESS_DENIED', 'ACCESS_REQUIRED'], [429, '', 'QUOTA'], [500, '', 'GOOGLE_API']]) {
        global.fetch = async () => Response.json({ error: { message: 'raw sensitive value', details: [{ reason }] } }, { status });
        await assert.rejects(businesses.listAccounts(), error => error.code === expected && !error.message.includes('raw sensitive value'));
    }
});
