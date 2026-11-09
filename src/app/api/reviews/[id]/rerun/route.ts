import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueReview } from '@/lib/reviewJobs';
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!await prisma.reviewAnalysis.findUnique({ where: { id }, select: { id: true } })) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    try {
        const job = await queueReview(id);
        return NextResponse.json({ analysisId: id, jobId: job.id }, { status: 202 });
    } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 409 }); }
}
