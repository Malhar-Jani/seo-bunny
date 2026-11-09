import { connectionStatus, saveCredential } from '@/lib/gbp/oauth';
import { guardLocal } from '@/lib/gbp/security';
import { failure, json, smallBody } from '@/lib/gbp/http';
export const runtime = 'nodejs';
export async function GET(req: Request) {
    try { guardLocal(req); return json(await connectionStatus()); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
    try { guardLocal(req, true); const body = await smallBody(req); await saveCredential(body.clientId, body.clientSecret); return json({ ok: true }); } catch (error) { return failure(error); }
}
