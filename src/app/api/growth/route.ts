import { prisma } from '@/lib/prisma';
import { guardLocal, GbpError } from '@/lib/gbp/security';
import { failure, json, smallBody } from '@/lib/gbp/http';
import { getBusiness, inbox, profileChecks, reviewLink, syncReviews, saveReply, publishReply, savePost, approvePost, text } from '@/lib/growth';

export async function GET(req: Request) {
    try {
        guardLocal(req);
        const id = new URL(req.url).searchParams.get('businessId') || '';
        const business = await getBusiness(id);
        const [reviews, posts, contacts] = await Promise.all([
            inbox(id), prisma.businessPost.findMany({ where: { businessId: id }, orderBy: { createdAt: 'desc' }, take: 200 }),
            prisma.businessContact.findMany({ where: { businessId: id }, orderBy: { createdAt: 'desc' }, take: 500 }),
        ]);
        return json({ business, inbox: reviews, posts, contacts, reviewLink: reviewLink(business), checks: profileChecks(business) });
    } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
    try {
        guardLocal(req, true);
        const body = await smallBody(req);
        const id = text(body.businessId, 'Business', 100);
        await getBusiness(id);
        switch (body.action) {
            case 'sync': return json(await syncReviews(id));
            case 'saveReply': return json(await saveReply(id, body));
            case 'publishReply': await publishReply(id, body); return json({ ok: true });
            case 'savePost': return json(await savePost(id, body));
            case 'approvePost': await approvePost(id, body); return json({ ok: true });
            case 'cancelPost': {
                const result = await prisma.businessPost.updateMany({ where: { id: body.id, businessId: id, status: 'SCHEDULED' }, data: { status: 'DRAFT', approvedAt: null, approvedSubject: null, targetLocation: null, scheduledAt: null } });
                if (!result.count) throw new GbpError('LOCKED_POST', 'The post is no longer scheduled. Refresh to check its status.', 409);
                return json({ ok: true });
            }
            case 'deletePost': {
                const result = await prisma.businessPost.deleteMany({ where: { id: body.id, businessId: id, status: { in: ['DRAFT', 'FAILED'] } } });
                if (!result.count) throw new GbpError('LOCKED_POST', 'Only local drafts can be deleted here.');
                return json({ ok: true });
            }
            case 'saveContact': {
                const phone = text(body.phone, 'Phone', 30, true);
                const email = text(body.email, 'Email', 200, true);
                if (phone && !/^\+?[\d\s()-]{7,30}$/.test(phone)) throw new GbpError('INVALID_PHONE', 'Enter a valid phone number, including its country code.');
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GbpError('INVALID_EMAIL', 'Enter a valid email address.');
                if (!['NEW', 'CONTACTED', 'CLIENT'].includes(body.stage)) throw new GbpError('INVALID_STAGE', 'Choose a contact stage.');
                const data = { name: text(body.name, 'Name', 150), phone: phone || null, email: email || null, notes: text(body.notes, 'Notes', 3000, true) || null, permission: body.permission === true, stage: body.stage };
                if (body.id) {
                    const result = await prisma.businessContact.updateMany({ where: { id: body.id, businessId: id }, data });
                    if (!result.count) throw new GbpError('NOT_FOUND', 'Contact not found.', 404);
                    return json({ ok: true });
                }
                return json(await prisma.businessContact.create({ data: { businessId: id, ...data } }));
            }
            case 'deleteContact': await prisma.businessContact.deleteMany({ where: { id: body.id, businessId: id } }); return json({ ok: true });
            default: throw new GbpError('INVALID_ACTION', 'Choose a supported workspace action.');
        }
    } catch (e) { return failure(e); }
}
