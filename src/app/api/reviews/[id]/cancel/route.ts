import { NextResponse } from 'next/server';
import { cancelReview } from '@/lib/reviewJobs';
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    await cancelReview((await params).id);
    return NextResponse.json({ ok: true });
}
