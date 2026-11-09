/** All API data belongs to one local user. Never trust forwarded host headers. */
export function localAccessError(req: Request, configuredOrigin?: string): string | null {
    const url = new URL(req.url);
    const expected = new URL(configuredOrigin || `http://127.0.0.1:${url.port || '80'}`);
    if (expected.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(expected.hostname)) return 'Invalid local server configuration.';
    const host = req.headers.get('host');
    const allowed = new Set([expected.host]);
    // Both loopback spellings are supported; arbitrary DNS names and rebinding are not.
    allowed.add(expected.hostname === 'localhost' ? expected.host.replace('localhost', '127.0.0.1') : expected.host.replace('127.0.0.1', 'localhost'));
    if (!host || !allowed.has(host)) return 'Open SEO Bunny using its local address.';
    const origin = req.headers.get('origin');
    if (req.headers.get('sec-fetch-site') === 'cross-site' && url.pathname !== '/api/gbp/callback') return 'External websites cannot access your workspace.';
    if (origin && origin !== `http://${host}`) return 'This request came from a different website.';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin !== `http://${host}`) return 'Refresh SEO Bunny and try again from its local window.';
    return null;
}
