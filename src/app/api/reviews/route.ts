import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { businessScope } from '@/lib/business-scope';
import { queueReview } from '@/lib/reviewJobs';
import { validateMapsUrl } from '@/lib/reviewPolicy';

export async function GET(req?: Request) {
    const analyses = await prisma.reviewAnalysis.findMany({ where: businessScope(req), orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, businessName: true, businessUrl: true, savedBusinessId: true, totalReviews: true,
            collectedReviews: true, collectionComplete: true, averageRating: true, status: true, error: true, createdAt: true,
            job: { select: { status: true, stage: true, logs: true, cancelRequested: true } } },
    });
    return NextResponse.json(analyses);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const url = validateMapsUrl(body.url);
        const business = body.savedBusinessId ? await prisma.savedBusiness.findUnique({ where: { id: body.savedBusinessId } }) : null;
        const analysis = await prisma.$transaction(async tx => {
            const existing = await tx.reviewAnalysis.findFirst({ where: { businessUrl: url, status: { in: ['PENDING', 'QUEUED', 'SCRAPING', 'ANALYZING'] } } });
            if (existing) throw new Error('This business is already being analyzed.');
            return tx.reviewAnalysis.create({ data: {
            businessUrl: url, businessName: business?.name || String(body.businessName || 'Business').slice(0, 250),
            savedBusinessId: business?.id, placeId: business?.placeId || body.placeId || null,
            totalReviews: Math.max(0, Number(body.totalReviews) || 0), averageRating: Math.min(5, Math.max(0, Number(body.averageRating) || 0)),
            status: 'PENDING',
        } }); });
        const job = await queueReview(analysis.id);
        return NextResponse.json({ analysisId: analysis.id, jobId: job.id }, { status: 202 });
    } catch (error: any) { return NextResponse.json({ error: error.message }, { status: /already being analyzed/.test(error.message) ? 409 : 400 }); }
}
