import { prisma } from '@/lib/prisma';
import ScansClient from './ScansClient';

export const dynamic = 'force-dynamic';
export default async function ScansPage({searchParams}: {searchParams: Promise<{businessId?: string}>}) {
    const {businessId} = await searchParams;
    const scans = await prisma.scan.findMany({
        where: businessId ? { savedBusinessId: businessId } : {},
        orderBy: { createdAt: 'desc' },
    });

    // Serialize dates for client component
    const serializedScans = scans.map(scan => ({
        ...scan,
        createdAt: scan.createdAt.toISOString()
    }));

    return <ScansClient initialScans={serializedScans} />;
}
