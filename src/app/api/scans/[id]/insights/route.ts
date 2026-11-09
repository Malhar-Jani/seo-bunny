import { prisma } from '@/lib/prisma';
import { scanSummary } from '@/lib/rank-metrics';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const scan = await prisma.scan.findUnique({ where: { id } });
    if (!scan) return Response.json({ error: 'Scan not found.' }, { status: 404 });
    const selected = new URL(req.url).searchParams.get('runId') || scan.currentRunId;
    const rows = await prisma.result.findMany({ where: { scanId: id }, orderBy: { runAt: 'asc' } });
    const runIds = [...new Set(rows.map(r => r.runId))];
    const index = runIds.indexOf(selected);
    const prior = index > 0 ? runIds[index - 1] : undefined;
    return Response.json(scanSummary(rows.filter(r => r.runId === selected), prior === undefined ? [] : rows.filter(r => r.runId === prior), { lat: scan.centerLat, lng: scan.centerLng }));
}
