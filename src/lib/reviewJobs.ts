import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { scrapeGoogleReviews } from './reviewScraper';
import { analyzeReviews } from './reviewAnalyzer';
import { enrichReviews } from './reviewAnalyzerCompute';
import { collectionCoverage, deduplicateReviewCollection, supportedSentimentText } from './reviewPolicy';

const state = globalThis as typeof globalThis & {
    reviewWorker?: { running: boolean; controllers: Map<string, AbortController> };
};
const worker = state.reviewWorker ||= { running: false, controllers: new Map() };
export const activeReviewStatuses = ['QUEUED', 'SCRAPING', 'ANALYZING'];

export async function queueReview(analysisId: string) {
    // The claim and job replacement are one transaction; repeated clicks cannot start two runs.
    const job = await prisma.$transaction(async tx => {
        const claim = await tx.reviewAnalysis.updateMany({
            where: { id: analysisId, status: { notIn: activeReviewStatuses } },
            data: { status: 'QUEUED', error: null },
        });
        if (!claim.count) throw new Error('Analysis is already running or does not exist.');
        return tx.reviewJob.upsert({ where: { analysisId },
            create: { analysisId },
            update: { status: 'QUEUED', stage: 'Waiting to start', logs: '[]', cancelRequested: false, startedAt: null, finishedAt: null },
        });
    });
    void processReviewQueue();
    return job;
}

export async function cancelReview(analysisId: string) {
    await prisma.$transaction([
        prisma.reviewJob.updateMany({ where: { analysisId, status: { in: activeReviewStatuses } }, data: { cancelRequested: true } }),
        prisma.reviewJob.updateMany({ where: { analysisId, status: 'QUEUED' }, data: { status: 'CANCELLED', stage: 'Cancelled', finishedAt: new Date() } }),
        prisma.reviewAnalysis.updateMany({ where: { id: analysisId, status: 'QUEUED' }, data: { status: 'CANCELLED' } }),
    ]);
    worker.controllers.get(analysisId)?.abort();
}

export async function recoverReviewJobs() {
    // Interrupted collections require an explicit retry, preserving the last good report.
    await prisma.$transaction([
        prisma.reviewAnalysis.updateMany({ where: { status: { in: ['SCRAPING', 'ANALYZING'] } }, data: { status: 'INTERRUPTED', error: 'The server stopped during collection. Retry when you are ready.' } }),
        prisma.reviewJob.updateMany({ where: { status: { in: ['SCRAPING', 'ANALYZING'] } }, data: { status: 'INTERRUPTED', stage: 'Interrupted. Retry to collect again.', finishedAt: new Date() } }),
    ]);
    void processReviewQueue();
}

export async function processReviewQueue() {
    if (worker.running) return;
    worker.running = true;
    try {
        while (true) {
            const job = await prisma.reviewJob.findFirst({ where: { status: 'QUEUED', cancelRequested: false }, orderBy: { createdAt: 'asc' }, include: { analysis: true } });
            if (!job) break;
            const claim = await prisma.reviewJob.updateMany({ where: { id: job.id, status: 'QUEUED', cancelRequested: false }, data: { status: 'SCRAPING', startedAt: new Date(), stage: 'Opening Google Maps' } });
            if (!claim.count) continue;
            await executeReviewJob(job);
        }
    } finally { worker.running = false; }
}

async function executeReviewJob(job: { id: string; analysisId: string; analysis: { businessUrl: string; businessName: string } }) {
    const controller = new AbortController();
    worker.controllers.set(job.analysisId, controller);
    const logs: { msg: string; at: string }[] = [];
    let lastSaved = 0;
    let flush = Promise.resolve();
    const progress = (msg: string) => {
        logs.push({ msg, at: new Date().toISOString() });
        if (logs.length > 60) logs.shift();
        if (Date.now() - lastSaved > 1200) {
            lastSaved = Date.now();
            const snapshot = JSON.stringify(logs);
            flush = flush.then(async () => { await prisma.reviewJob.update({ where: { id: job.id }, data: { stage: msg, logs: snapshot } }); }).catch(() => {});
        }
    };
    const cancelPoll = setInterval(() => {
        void prisma.reviewJob.findUnique({ where: { id: job.id }, select: { cancelRequested: true } })
            .then(current => { if (!current || current.cancelRequested) controller.abort(); }).catch(() => {});
    }, 1500);
    const checkCancelled = () => { if (controller.signal.aborted) throw new Error('Collection cancelled.'); };
    try {
        await prisma.reviewAnalysis.update({ where: { id: job.analysisId }, data: { status: 'SCRAPING' } });
        const { business, reviews: scraped } = await scrapeGoogleReviews(job.analysis.businessUrl, progress, controller.signal);
        checkCancelled();
        const reviews = deduplicateReviewCollection(scraped);
        const coverage = collectionCoverage(reviews.length, business.totalReviews);
        await prisma.$transaction([
            prisma.reviewAnalysis.update({ where: { id: job.analysisId }, data: { status: 'ANALYZING' } }),
            prisma.reviewJob.update({ where: { id: job.id }, data: { status: 'ANALYZING', stage: 'Finding patterns and next actions' } }),
        ]);
        const metrics = analyzeReviews(reviews);
        const enriched = enrichReviews(reviews);
        const languageCoverage = reviews.length ? reviews.filter(r => supportedSentimentText(r.text)).length / reviews.length * 100 : 0;
        const runId = randomUUID();
        const runAt = new Date();
        // Write a whole run atomically. A failed/cancelled retry leaves the last report intact.
        checkCancelled();
        await flush;
        await prisma.$transaction(async tx => {
            const current = await tx.reviewJob.findUnique({ where: { id: job.id } });
            if (current?.cancelRequested) throw new Error('Collection cancelled.');
            for (let i = 0; i < enriched.length; i += 100) {
                await tx.review.createMany({ data: enriched.slice(i, i + 100).map(r => ({
                    analysisId: job.analysisId, runId, runAt, reviewerName: r.reviewerName,
                    reviewerUrl: r.reviewerUrl, reviewImage: r.reviewImage, reviewCount: r.reviewCount, photoCount: r.photoCount,
                    rating: r.rating, text: r.text, publishedDate: r.publishedDate, responseText: r.responseText, responseDate: r.responseDate,
                    sentimentScore: r.sentimentScore, sentimentLabel: r.sentimentLabel,
                    fakeScore: r.fakeScore, isLikelyFake: r.fakeScore >= 50,
                    analysisBlob: JSON.stringify({ reasons: r.fakeReasons, languageSupported: supportedSentimentText(r.text), confidence: r.sentimentResult.confidence }),
                })) });
            }
            const status = coverage.complete ? 'COMPLETED' : 'PARTIAL';
            await tx.reviewRun.create({ data: { id: runId, analysisId: job.analysisId, businessName: business.name,
                averageRating: business.averageRating, totalReviews: business.totalReviews, collectedReviews: reviews.length,
                collectionComplete: coverage.complete, languageCoverage, analysisData: JSON.stringify(metrics) } });
            await tx.reviewAnalysis.update({ where: { id: job.analysisId }, data: {
                businessName: business.name, totalReviews: business.totalReviews, averageRating: business.averageRating,
                placeId: business.placeId, collectedReviews: reviews.length, collectionComplete: coverage.complete,
                languageCoverage, currentRunId: runId, status, analysisData: JSON.stringify(metrics),
                error: coverage.complete ? null : `Collected ${reviews.length} of ${business.totalReviews || 'an unknown number of'} reviews. Findings describe the collected sample.`,
            } });
            await tx.reviewJob.update({ where: { id: job.id }, data: { status, stage: coverage.complete ? 'Collection complete' : 'Partial collection saved', logs: JSON.stringify(logs), finishedAt: new Date() } });
        }, { timeout: 60000 });
    } catch (error: any) {
        await flush;
        const status = controller.signal.aborted || /cancelled/i.test(error.message) ? 'CANCELLED' : 'FAILED';
        await prisma.$transaction([
            prisma.reviewAnalysis.updateMany({ where: { id: job.analysisId }, data: { status, error: error.message } }),
            prisma.reviewJob.updateMany({ where: { id: job.id }, data: { status, stage: error.message, logs: JSON.stringify(logs), finishedAt: new Date() } }),
        ]);
    } finally { clearInterval(cancelPoll); worker.controllers.delete(job.analysisId); }
}
