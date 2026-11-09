import { importBusinesses } from '@/lib/gbp/businesses';
import { guardLocal } from '@/lib/gbp/security';
import { failure, json, smallBody } from '@/lib/gbp/http';
export async function POST(req: Request) {
    try { guardLocal(req, true); const body = await smallBody(req); return json(await importBusinesses(body.accountName, body.selected)); } catch (error) { return failure(error); }
}
