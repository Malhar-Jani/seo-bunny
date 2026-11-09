import { beginConnection } from '@/lib/gbp/oauth';
import { guardLocal, STATE_COOKIE } from '@/lib/gbp/security';
import { failure, json } from '@/lib/gbp/http';
export const runtime = 'nodejs';
export async function POST(req: Request) {
    try {
        guardLocal(req, true);
        const { url, browser } = await beginConnection();
        const response = json({ url });
        response.cookies.set(STATE_COOKIE, browser, { httpOnly: true, sameSite: 'lax', path: '/api/gbp/callback', maxAge: 600 });
        return response;
    } catch (error) { return failure(error); }
}
