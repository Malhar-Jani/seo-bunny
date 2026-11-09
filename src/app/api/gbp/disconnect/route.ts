import { disconnect } from '@/lib/gbp/oauth';
import { guardLocal } from '@/lib/gbp/security';
import { failure, json } from '@/lib/gbp/http';
export async function POST(req: Request) {
    try { guardLocal(req, true); await disconnect(); return json({ ok: true }); } catch (error) { return failure(error); }
}
