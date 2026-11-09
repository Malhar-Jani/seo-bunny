import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withGoogleProfiles } from '@/lib/gbp/businesses';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const business = await prisma.savedBusiness.findUnique({ where: { id } });
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    const [scans, reviews] = await Promise.all([
        prisma.scan.findMany({ where: { OR: [{ savedBusinessId: id }, { businessName: business.name }] }, take: 30, orderBy: { createdAt: 'desc' }, select: { id: true, keyword: true, status: true, createdAt: true } }),
        prisma.reviewAnalysis.findMany({ where: { OR: [{ savedBusinessId: id }, { businessName: business.name }] }, take: 30, orderBy: { createdAt: 'desc' }, select: { id: true, businessName: true, status: true, collectedReviews: true, createdAt: true } }),
    ]);
    return NextResponse.json({ business: (await withGoogleProfiles([business]))[0], scans, reviews }, { headers: { 'Cache-Control': 'no-store' } });
}
