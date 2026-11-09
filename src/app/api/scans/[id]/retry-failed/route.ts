import { prisma } from '@/lib/prisma';
import { enqueueScan, isScanActive } from '@/lib/scanQueue';
import { isChecked } from '@/lib/rank-metrics';
import { randomUUID } from 'node:crypto';
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (isScanActive(id)) return Response.json({ error: 'Wait for this scan to finish.' }, { status: 409 });
    try {
        const result = await prisma.$transaction(async tx => {
            const scan = await tx.scan.findUnique({ where: { id } });
            if (!scan) throw new Error('NOT_FOUND');
            if (['PENDING', 'RUNNING'].includes(scan.status)) throw new Error('BUSY');
            const rows = await tx.result.findMany({ where: { scanId: id, runId: scan.currentRunId } });
            const retry = rows.filter(r => !isChecked(r));
            if (!retry.length) throw new Error('NO_FAILURES');
            const runId = `run-${randomUUID()}`;
            const claimed = await tx.scan.updateMany({ where: { id, status: scan.status, currentRunId: scan.currentRunId }, data: { status: 'PENDING', currentRunId: runId } });
            if (!claimed.count) throw new Error('BUSY');
            // Preserve the old run; reuse only verified captures in the new run.
            for (const row of rows.filter(isChecked)) {
                const { id: _id, ...data } = row;
                await tx.result.create({ data: { ...data, runId, runAt: new Date() } });
            }
            return { runId, retryCount: retry.length };
        });
        enqueueScan(id);
        return Response.json(result);
    } catch (error: any) {
        const messages: Record<string, string> = { NOT_FOUND: 'Scan not found.', BUSY: 'This scan is already queued or running.', NO_FAILURES: 'There are no failed or unknown checkpoints to retry.' };
        return Response.json({ error: messages[error.message] || 'Could not queue the retry.' }, { status: error.message === 'NOT_FOUND' ? 404 : messages[error.message] ? 409 : 500 });
    }
}
