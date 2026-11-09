import { prisma } from './prisma';
import { enqueueScan, recoverQueue } from './scanQueue';
import { processReviewQueue, recoverReviewJobs } from './reviewJobs';
import { purgeGoogleCache } from './gbp/businesses';
import { runScheduledPosts, recoverPublishing } from './growth';

const state = globalThis as typeof globalThis & { seoBackground?: { timer?: ReturnType<typeof setInterval>; ticking: boolean } };

export async function runScheduledScans(now = new Date()) {
    const due = await prisma.scan.findMany({ where: {
        frequency: { in: ['DAILY', 'WEEKLY'] }, nextRun: { lte: now }, status: { in: ['COMPLETED', 'FAILED'] },
    }, select: { id: true, frequency: true, nextRun: true } });
    for (const scan of due) {
        const nextRun = new Date(now.getTime() + (scan.frequency === 'WEEKLY' ? 7 : 1) * 86400000);
        const claim = await prisma.scan.updateMany({ where: { id: scan.id, nextRun: scan.nextRun, status: { in: ['COMPLETED', 'FAILED'] } }, data: { status: 'PENDING', nextRun } });
        if (claim.count) enqueueScan(scan.id);
    }
    return due.length;
}

export async function startBackgroundWork() {
    if (process.env.SEO_BUNNY_DISABLE_BACKGROUND === '1') return;
    if (state.seoBackground) return;
    const background: NonNullable<typeof state.seoBackground> = { ticking: false };
    state.seoBackground = background;
    const tick = async () => {
        if (background.ticking) return;
        background.ticking = true;
        try { await purgeGoogleCache(); await runScheduledScans(); await runScheduledPosts(); void processReviewQueue(); }
        catch (error) { console.error('[Scheduler]', error); }
        finally { background.ticking = false; }
    };
    try { await recoverPublishing(); await recoverReviewJobs(); await recoverQueue(); }
    catch (error) { console.error('[Recovery]', error); }
    await tick();
    background.timer = setInterval(tick, 30000);
    background.timer.unref?.();
}
