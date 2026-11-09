import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const tables = ['savedBusiness', 'scan', 'result', 'reviewAnalysis', 'review', 'reviewJob', 'reviewRun', 'proxy', 'alert', 'globalSetting', 'systemLog', 'webhook', 'gridPreset', 'googleBusinessLink', 'businessPost', 'replyDraft', 'businessContact'];
function googleLink(row: any) {
    // Preserve workspace mappings across restores without exporting cached content.
    const { id, businessId, subject, accountName, locationName, updatedAt } = row;
    return { id, businessId, subject, accountName, locationName, updatedAt };
}
async function snapshot(db: any) {
    const data: Record<string, any[]> = {};
    for (const table of tables) {
        const rows = await db[table].findMany();
        data[table] = table === 'googleBusinessLink' ? rows.map(googleLink) : rows;
    }
    return { format: 'SEOTracker-backup', version: 1, createdAt: new Date().toISOString(), data };
}
export async function GET() {
    const backup = await prisma.$transaction(tx => snapshot(tx));
    return new NextResponse(JSON.stringify(backup), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="seo-bunny-${new Date().toISOString().slice(0,10)}.json"`, 'Cache-Control': 'no-store' } });
}
export async function POST(req: Request) {
    try {
        const content = await req.text();
        if (Buffer.byteLength(content) > 30 * 1024 * 1024) throw new Error('Backup exceeds the 30 MB restore limit.');
        const backup = JSON.parse(content);
        if (backup.format !== 'SEOTracker-backup' || backup.version !== 1 || !backup.data) throw new Error('Choose a valid SEO Bunny workspace backup.');
        // Version 1 backups made before Google integration have no link table.
        if (backup.data.googleBusinessLink === undefined) backup.data.googleBusinessLink = [];
        for (const table of ['businessPost', 'replyDraft', 'businessContact']) if (backup.data[table] === undefined) backup.data[table] = [];
        for (const table of tables) {
            if (!Array.isArray(backup.data[table]) || backup.data[table].length > 100000) throw new Error(`Invalid backup table: ${table}`);
        }
        const active = await prisma.reviewJob.count({ where: { status: { in: ['QUEUED','SCRAPING','ANALYZING'] } } }) + await prisma.scan.count({ where: { status: { in: ['PENDING','RUNNING'] } } });
        const publishing = await prisma.businessPost.count({ where: { status: 'PUBLISHING' } }) + await prisma.replyDraft.count({ where: { status: 'PUBLISHING' } });
        if (active || publishing) return NextResponse.json({ error: 'Stop active jobs and wait for publishing before restoring a backup.' }, { status: 409 });
        const previous = await prisma.$transaction(tx => snapshot(tx));
        const backupDir = path.join(process.cwd(), '.local-backups');
        await mkdir(backupDir, { recursive: true });
        const recoveryName = `before-restore-${Date.now()}.json`;
        await writeFile(path.join(backupDir, recoveryName), JSON.stringify(previous));
        await prisma.$transaction(async tx => {
            const db = tx as any;
            const working = await tx.reviewJob.count({ where: { status: { in: ['QUEUED','SCRAPING','ANALYZING'] } } }) + await tx.scan.count({ where: { status: { in: ['PENDING','RUNNING'] } } });
            if (working) throw new Error('A job started while preparing the restore. Stop it and try again.');
            if (await tx.businessPost.count({ where: { status: 'PUBLISHING' } }) + await tx.replyDraft.count({ where: { status: 'PUBLISHING' } })) throw new Error('Publishing started while preparing the restore. Try again after it finishes.');
            for (const table of ['googleReviewCache','businessPost','replyDraft','businessContact','googleBusinessLink','reviewJob','reviewRun','review','reviewAnalysis','result','alert','scan','proxy','globalSetting','systemLog','webhook','gridPreset','savedBusiness']) await db[table].deleteMany();
            for (const table of tables) {
                const records = backup.data[table].map((row: any) => {
                    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid row in ${table}`);
                    if (table === 'googleBusinessLink') return googleLink(row);
                    // Restored work never gains permission to publish automatically.
                    if (table === 'businessPost') return { ...row, status: ['SCHEDULED', 'PUBLISHING'].includes(row.status) ? 'DRAFT' : row.status, approvedAt: null, approvedSubject: null, targetLocation: null, scheduledAt: null };
                    if (table === 'replyDraft' && row.status === 'PUBLISHING') return { ...row, status: 'CHECK_GOOGLE' };
                    if (table === 'reviewJob' && ['QUEUED','SCRAPING','ANALYZING'].includes(row.status)) return { ...row, status: 'INTERRUPTED', stage: 'Restored job. Retry to collect again.' };
                    if (table === 'reviewAnalysis' && ['QUEUED','SCRAPING','ANALYZING'].includes(row.status)) return { ...row, status: 'INTERRUPTED' };
                    if (table === 'scan' && ['PENDING','RUNNING'].includes(row.status)) return { ...row, status: 'FAILED' };
                    return row;
                });
                for (let i=0; i<records.length; i+=100) await db[table].createMany({ data: records.slice(i,i+100) });
            }
        }, { timeout: 60000 });
        return NextResponse.json({ ok: true, recoveryBackup: recoveryName });
    } catch (error: any) { return NextResponse.json({ error: `Restore did not complete. ${error.message}` }, { status: 400 }); }
}

