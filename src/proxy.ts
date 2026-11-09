import { NextRequest, NextResponse } from 'next/server';
import { localAccessError } from './lib/local-access';

export function proxy(req: NextRequest) {
    if (process.env.SEO_BUNNY_DEMO_ONLY === '1' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return NextResponse.json({ error: 'The demo is read-only. Start SEO Bunny normally to use your own workspace.' }, { status: 403 });
    }
    const error = localAccessError(req, process.env.GBP_APP_ORIGIN);
    if (error) return NextResponse.json({ error }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
}
export const config = { matcher: '/api/:path*' };
