import { discoverBusinesses } from '@/lib/gbp/businesses';
import { guardLocal } from '@/lib/gbp/security';
import { failure, json } from '@/lib/gbp/http';
export async function GET(req: Request) {
    try { guardLocal(req); const result = await discoverBusinesses(new URL(req.url).searchParams.get('account') || ''); return json({ businesses: result.businesses }); } catch (error) { return failure(error); }
}
