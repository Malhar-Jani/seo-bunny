import { accessToken } from './oauth';
import { GbpError } from './security';

// Fixed Google origin and server-selected resource paths, never client URLs.
export async function businessRequest(path: string, subject: string, method = 'GET', data?: unknown) {
    if (!/^accounts\/\d+\/locations\/\d+(?:\/|\?|$)/.test(path)) throw new GbpError('INVALID_RESOURCE', 'The Google business link is invalid. Import it again.');
    let auth = await accessToken();
    if (auth.subject !== subject) throw new GbpError('CONNECTION_CHANGED', 'The Google account changed. Reconnect this business.', 409);
    const request = () => fetch(`https://mybusiness.googleapis.com/v4/${path}`, {
        method, headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    let response: Response;
    try {
        response = await request();
        // An explicit 401 did not accept the operation. Never retry a timed-out POST.
        if (response.status === 401) {
            auth = await accessToken(true);
            if (auth.subject !== subject) throw new GbpError('CONNECTION_CHANGED', 'The Google account changed. Reload this page.', 409);
            response = await request();
        }
    } catch (e) {
        if (e instanceof GbpError) throw e;
        throw new GbpError(method === 'GET' ? 'GOOGLE_UNAVAILABLE' : 'DELIVERY_UNKNOWN', method === 'GET'
            ? 'Google did not respond. Try again shortly.'
            : 'Google did not confirm the result. Check the Business Profile on Google before trying again.', 502);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = response.status === 403 ? 'Google denied this action. Check API approval, Google My Business API activation, and your manager permissions.'
            : response.status === 429 ? 'Google’s request limit was reached. Try again later.'
            : response.status === 401 ? 'Reconnect your Google account.'
            : response.status === 404 ? 'This business or review is no longer available on Google. Refresh the business connection.'
            : response.status >= 500 && method !== 'GET' ? 'Google could not confirm delivery. Check your Business Profile before trying again.'
            : 'Google rejected this request. Check the content and business eligibility, then try again.';
        throw new GbpError(response.status >= 500 && method !== 'GET' ? 'DELIVERY_UNKNOWN' : 'GOOGLE_API', message, response.status >= 500 ? 502 : response.status);
    }
    return body;
}
