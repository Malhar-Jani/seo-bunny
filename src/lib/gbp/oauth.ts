import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { prisma } from '../prisma';
import { decrypt, encrypt, GBP_SCOPE, GbpError, hash, random, redirectUri } from './security';

async function credential() {
    const config = await prisma.googleCredential.findUnique({ where: { id: 'local' } });
    if (!config) throw new GbpError('NOT_CONFIGURED', 'Save your Google OAuth client details first.');
    return config;
}
async function client() {
    const config = await credential();
    return { config, oauth: new OAuth2Client(config.clientId, await decrypt(config.secretEncrypted), redirectUri()) };
}
export async function connectionStatus() {
    const [config, connection] = await Promise.all([
        prisma.googleCredential.findUnique({ where: { id: 'local' }, select: { clientId: true } }),
        prisma.googleConnection.findUnique({ where: { id: 'local' }, select: { email: true, connectedAt: true } }),
    ]);
    return { configured: !!config, clientId: config?.clientId || '', connection, redirectUri: redirectUri() };
}
export async function saveCredential(clientId: unknown, secret: unknown) {
    if (typeof clientId !== 'string' || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || clientId.length > 300) throw new GbpError('INVALID_CLIENT', 'Enter the OAuth client ID ending in .apps.googleusercontent.com.');
    const current = await prisma.googleCredential.findUnique({ where: { id: 'local' } });
    if (secret === '' && current?.clientId === clientId) return;
    if (typeof secret !== 'string' || secret.trim().length < 8 || secret.length > 1000) throw new GbpError('INVALID_SECRET', 'Enter the client secret from your Google Web application client.');
    const secretEncrypted = await encrypt(secret.trim());
    await prisma.$transaction(async tx => {
        await tx.googleOAuthAttempt.deleteMany();
        await tx.googleConnection.deleteMany();
        await tx.googleReviewCache.deleteMany();
        await tx.googleCredential.upsert({ where: { id: 'local' }, create: { id: 'local', clientId, secretEncrypted }, update: { clientId, secretEncrypted } });
    });
}
export async function beginConnection() {
    const { config, oauth } = await client();
    const state = random(), browser = random(), nonce = random();
    const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
    await prisma.googleOAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.googleOAuthAttempt.create({ data: {
        id: hash(state), browserHash: hash(browser), verifierEncrypted: await encrypt(codeVerifier), nonce,
        clientId: config.clientId, credentialVersion: config.updatedAt.toISOString(), expiresAt: new Date(Date.now() + 600000),
    } });
    const url = oauth.generateAuthUrl({
        scope: ['openid', 'email', GBP_SCOPE], access_type: 'offline', prompt: 'consent select_account', state, nonce,
        code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
    });
    return { url, browser };
}
export async function finishConnection(state: string | null, browser: string | undefined, code: string | null, denied: boolean) {
    if (!state || !browser) throw new GbpError('INVALID_STATE', 'The connection request expired or was opened in another browser. Start again from this app.');
    const attempt = await prisma.googleOAuthAttempt.findUnique({ where: { id: hash(state) } });
    if (!attempt || attempt.browserHash !== hash(browser) || attempt.expiresAt.getTime() <= Date.now()) throw new GbpError('INVALID_STATE', 'The connection request expired or was already used. Start again from this app.');
    // Delete as a conditional claim before contacting Google, so a callback cannot be replayed.
    const claim = await prisma.googleOAuthAttempt.deleteMany({ where: { id: attempt.id, browserHash: hash(browser) } });
    if (!claim.count) throw new GbpError('INVALID_STATE', 'This connection request was already used.');
    if (denied) throw new GbpError('ACCESS_DENIED', 'Google access was cancelled. You can connect again whenever you are ready.');
    if (!code || code.length > 4096) throw new GbpError('MISSING_CODE', 'Google did not return a connection code. Try connecting again.');
    const { config, oauth } = await client();
    if (config.clientId !== attempt.clientId || config.updatedAt.toISOString() !== attempt.credentialVersion) throw new GbpError('CONFIG_CHANGED', 'Your Google client settings changed. Start a new connection.');
    let tokens;
    try { ({ tokens } = await oauth.getToken({ code, codeVerifier: await decrypt(attempt.verifierEncrypted), redirect_uri: redirectUri() })); }
    catch { throw new GbpError('TOKEN_EXCHANGE', 'Google could not complete sign-in. Check the client secret and exact callback address, then try again.'); }
    if (!tokens.scope?.split(' ').includes(GBP_SCOPE)) throw new GbpError('MISSING_SCOPE', 'Business Profile access was not granted. Connect again and allow the Business Profile permission.');
    if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token) throw new GbpError('MISSING_TOKEN', 'Google did not return a lasting connection. Connect again and approve access.');
    let identity;
    try { identity = (await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId })).getPayload(); }
    catch { throw new GbpError('INVALID_IDENTITY', 'Google account verification failed. Start a new connection.'); }
    if (!identity?.sub || !identity.email || !identity.email_verified || identity.nonce !== attempt.nonce) throw new GbpError('INVALID_IDENTITY', 'Google account verification failed. Start a new connection.');
    const data = {
        clientId: config.clientId, subject: identity.sub, email: identity.email, scopes: tokens.scope,
        accessEncrypted: await encrypt(tokens.access_token), refreshEncrypted: await encrypt(tokens.refresh_token),
        expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000), connectedAt: new Date(),
    };
    await prisma.$transaction(async tx => {
        const latest = await tx.googleCredential.findUnique({ where: { id: 'local' } });
        if (!latest || latest.updatedAt.toISOString() !== attempt.credentialVersion) throw new GbpError('CONFIG_CHANGED', 'Your Google client settings changed. Start a new connection.');
        await tx.googleConnection.upsert({ where: { id: 'local' }, create: { id: 'local', ...data }, update: data });
    });
}

const state = globalThis as typeof globalThis & { gbpRefreshes?: Map<string, Promise<string>> };
const refreshes = state.gbpRefreshes ||= new Map();
export async function accessToken(force = false) {
    const connection = await prisma.googleConnection.findUnique({ where: { id: 'local' } });
    if (!connection) throw new GbpError('NOT_CONNECTED', 'Connect your manager Google account first.', 401);
    if (!force && connection.expiresAt.getTime() > Date.now() + 60000) return { token: await decrypt(connection.accessEncrypted), subject: connection.subject };
    const refreshKey = `${connection.clientId}:${connection.subject}:${connection.connectedAt.toISOString()}`;
    let refreshing = refreshes.get(refreshKey);
    if (!refreshing) {
        refreshing = (async () => {
            const { config, oauth } = await client();
            if (config.clientId !== connection.clientId) throw new GbpError('NOT_CONNECTED', 'Google client changed. Connect again.', 401);
            oauth.setCredentials({ refresh_token: await decrypt(connection.refreshEncrypted) });
            let credentials;
            try { ({ credentials } = await oauth.refreshAccessToken()); }
            catch (error: any) {
                if (error.response?.data?.error === 'invalid_grant') throw new GbpError('RECONNECT', 'Google access has expired or was revoked. Reconnect your account.', 401);
                throw new GbpError('GOOGLE_UNAVAILABLE', 'Google could not refresh the connection. Try again shortly.', 502);
            }
            if (!credentials.access_token) throw new GbpError('RECONNECT', 'Reconnect your Google account to continue.', 401);
            const updated = await prisma.googleConnection.updateMany({ where: { id: 'local', clientId: connection.clientId, subject: connection.subject, connectedAt: connection.connectedAt }, data: {
                accessEncrypted: await encrypt(credentials.access_token), expiresAt: new Date(credentials.expiry_date || Date.now() + 3600000),
                ...(credentials.refresh_token ? { refreshEncrypted: await encrypt(credentials.refresh_token) } : {}),
            } });
            if (!updated.count) throw new GbpError('CONNECTION_CHANGED', 'The Google connection changed. Reload this page.', 409);
            return credentials.access_token;
        })();
        refreshes.set(refreshKey, refreshing);
        void refreshing.finally(() => refreshes.delete(refreshKey)).catch(() => {});
    }
    return { token: await refreshing, subject: connection.subject };
}
export async function disconnect() {
    await prisma.$transaction([
        prisma.googleCredential.updateMany({ data: { updatedAt: new Date() } }),
        prisma.googleOAuthAttempt.deleteMany(), prisma.googleConnection.deleteMany(),
        prisma.googleReviewCache.deleteMany(),
        prisma.googleBusinessLink.updateMany({ data: { profileEncrypted: null, profileExpiresAt: null } }),
    ]);
}
