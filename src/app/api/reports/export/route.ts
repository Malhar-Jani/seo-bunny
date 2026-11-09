import { prisma } from '@/lib/prisma';
import { shareableReport } from '@/lib/share-export';
export async function GET() {
    const scans = await prisma.scan.findMany({ orderBy: { createdAt: 'desc' }, include: { results: true } });
    const current = scans.map(s => ({ ...s, results: s.results.filter(r => !s.currentRunId || r.runId === s.currentRunId) }));
    return Response.json(shareableReport(current), { headers: { 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="seo-bunny-shareable-report.json"' } });
}
