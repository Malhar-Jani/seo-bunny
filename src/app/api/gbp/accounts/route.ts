import { listAccounts } from '@/lib/gbp/businesses';
import { guardLocal } from '@/lib/gbp/security';
import { failure, json } from '@/lib/gbp/http';
export async function GET(req: Request) {
    try { guardLocal(req); return json({ accounts: await listAccounts() }); } catch (error) { return failure(error); }
}
