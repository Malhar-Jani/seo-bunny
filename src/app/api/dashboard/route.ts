import { prisma } from '@/lib/prisma';
import { rankMetrics, captureStatus } from '@/lib/rank-metrics';
import { businessScope } from '@/lib/business-scope';
export async function GET(req: Request) {
    try {
        const where = businessScope(req);
        const [scansCount, activeScans, scans, businesses, reviewIssues] = await Promise.all([
            prisma.scan.count({ where }), prisma.scan.count({ where: { ...where, status: { in: ['PENDING', 'RUNNING'] } } }),
            prisma.scan.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20, include: { results: true } }),
            prisma.savedBusiness.findMany({ where: where.savedBusinessId ? { id: where.savedBusinessId } : {}, orderBy: { name: 'asc' }, take: 50 }),
            prisma.reviewAnalysis.count({ where: { ...where, status: { in: ['FAILED', 'PARTIAL'] } } }),
        ]);
        const records = scans.map(({ results, ...scan }) => {
            const current = results.filter(r => !scan.currentRunId || r.runId === scan.currentRunId);
            return { ...scan, metrics: rankMetrics(current), points: current.map(r => ({ id: r.id, lat: r.lat, lng: r.lng, rank: r.rank, captureStatus: captureStatus(r) })) };
        });
        const latest = records.find(s => s.points.length);
        const attention = records.filter(s => ['FAILED', 'STOPPED'].includes(s.status) || s.metrics.failed || s.metrics.unknown).map(s => ({ id: s.id, keyword: s.keyword, reason: s.status === 'FAILED' ? 'Scan failed' : `${s.metrics.failed + s.metrics.unknown} checkpoints need another look` }));
        return Response.json({ scansCount, activeScans, latest, recentScans: records.map(({ points, ...s }) => s), attention, reviewIssues,
            businesses: businesses.map(b => ({ id: b.id, name: b.name, address: b.address, latest: records.find(s => s.savedBusinessId === b.id) || null })) });
    } catch { return Response.json({ error: 'Could not load your workspace. Try refreshing.' }, { status: 500 }); }
}
