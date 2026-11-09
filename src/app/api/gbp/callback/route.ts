import { NextRequest, NextResponse } from 'next/server';
import { finishConnection } from '@/lib/gbp/oauth';
import { appOrigin, GbpError, guardLocal, STATE_COOKIE } from '@/lib/gbp/security';
import { failure } from '@/lib/gbp/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
    try { guardLocal(req); } catch (error) { return failure(error); }
    let result = 'connected';
    try {
        const query = req.nextUrl.searchParams;
        await finishConnection(query.get('state'), req.cookies.get(STATE_COOKIE)?.value, query.get('code'), query.has('error'));
    } catch (error) { result = error instanceof GbpError ? error.code : 'INTERNAL'; }
    // Strip authorization codes immediately and never reflect Google's raw errors.
    const response = NextResponse.redirect(`${appOrigin()}/settings/google?result=${encodeURIComponent(result)}`, 303);
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(STATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/api/gbp/callback', maxAge: 0 });
    return response;
}
