import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export class GbpError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const random = () => randomBytes(32).toString('base64url');
export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';
export const STATE_COOKIE = 'seobunny_google_state';

export function appOrigin() {
    const origin = new URL(process.env.GBP_APP_ORIGIN || 'http://127.0.0.1:3210');
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
        throw new GbpError('LOCAL_ONLY', 'Google connection is configured for this laptop only.');
    }
    return origin.origin;
}
export const redirectUri = () => `${appOrigin()}/api/gbp/callback`;

// This app has no user login. Its credential endpoints must stay on the loopback
// address, with a matching browser origin for every mutation (including connect).
export function guardLocal(req: Request, mutation = false) {
    const expected = appOrigin();
    if (req.headers.get('host') !== new URL(expected).host) throw new GbpError('LOCAL_ONLY', `Open ${expected}/settings/google to manage this connection.`, 403);
    if (mutation && (req.headers.get('origin') !== expected || !req.headers.get('content-type')?.startsWith('application/json') || req.headers.get('sec-fetch-site') === 'cross-site')) {
        throw new GbpError('BAD_ORIGIN', 'Refresh this local page and try again.', 403);
    }
}

function keyDirectory() {
    // Keep the encryption key outside the source tree and exported backups.
    // Each checkout has its own key; desktop builds set a persistent private dir.
    return process.env.GBP_PRIVATE_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'SEOTracker', 'private', hash(process.cwd()).slice(0, 20));
}
async function key(create = false) {
    const dir = keyDirectory();
    const filename = path.join(dir, 'google.key');
    try {
        const value = await readFile(filename);
        if (value.length !== 32) throw new Error('Invalid key');
        return value;
    } catch (error: any) {
        if (error.code !== 'ENOENT') throw new GbpError('KEY_UNAVAILABLE', 'The local Google encryption key could not be read. Reconfigure the connection.');
        if (!create) throw new GbpError('KEY_UNAVAILABLE', 'This laptop is missing the Google encryption key. Reconfigure the connection.');
        await mkdir(dir, { recursive: true, mode: 0o700 });
        try { await writeFile(filename, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
        catch (error: any) { if (error.code !== 'EEXIST') throw new GbpError('KEY_UNAVAILABLE', 'Could not save the local Google encryption key.'); }
        return key();
    }
}
export async function encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await key(true), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
export async function decrypt(value: string) {
    try {
        const [version, iv, tag, ciphertext] = value.split('.');
        if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid envelope');
        const decipher = createDecipheriv('aes-256-gcm', await key(), Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
    } catch { throw new GbpError('KEY_UNAVAILABLE', 'The saved Google credentials could not be unlocked on this laptop. Reconfigure the connection.'); }
}
