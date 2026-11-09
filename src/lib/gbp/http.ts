import { NextResponse } from 'next/server';
import { GbpError } from './security';

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
export function failure(error: unknown) {
    return error instanceof GbpError ? json({ error: error.message, code: error.code }, error.status) : json({ error: 'The Google connection could not be completed. Try again.', code: 'INTERNAL' }, 500);
}
export async function smallBody(req: Request) {
    const text = await req.text();
    if (Buffer.byteLength(text) > 50000) throw new GbpError('TOO_LARGE', 'This request is too large.');
    try { return JSON.parse(text); } catch { throw new GbpError('INVALID_JSON', 'Refresh this page and try again.'); }
}
