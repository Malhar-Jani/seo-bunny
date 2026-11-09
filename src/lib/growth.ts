import { prisma } from './prisma';
import { withGoogleProfiles } from './gbp/businesses';
import { decrypt, encrypt, GbpError } from './gbp/security';
import { businessRequest } from './gbp/request';

const actions = ['NONE', 'LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'];
export function text(value: unknown, label: string, max: number, optional = false) {
    if (optional && (value == null || value === '')) return '';
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new GbpError('INVALID_INPUT', `${label} must be between 1 and ${max} characters.`);
    return value.trim();
}
export function publicUrl(value: unknown, label: string) {
    if (!value) return null;
    try {
        const url = new URL(text(value, label, 2000));
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.endsWith('.local')) throw Error();
        return url.href;
    } catch { throw new GbpError('INVALID_URL', `${label} must be a public HTTPS link.`); }
}
export async function getBusiness(id: string) {
    const row = await prisma.savedBusiness.findUnique({ where: { id } });
    if (!row) throw new GbpError('NOT_FOUND', 'Choose a saved business first.', 404);
    return (await withGoogleProfiles([row]))[0] as typeof row & { google?: { connected: boolean; needsRefresh: boolean } };
}
export async function linkedBusiness(businessId: string) {
    const [link, connection] = await Promise.all([
        prisma.googleBusinessLink.findUnique({ where: { businessId } }),
        prisma.googleConnection.findUnique({ where: { id: 'local' }, select: { subject: true } }),
    ]);
    if (!link || !connection || link.subject !== connection.subject) throw new GbpError('NOT_LINKED', 'Connect Google and import this business before syncing or publishing.', 409);
    if (!/^accounts\/\d+$/.test(link.accountName) || !/^locations\/\d+$/.test(link.locationName)) throw new GbpError('INVALID_RESOURCE', 'Import this business again to repair its Google link.');
    return { ...link, parent: `${link.accountName}/${link.locationName}` };
}
export function reviewLink(business: { placeId?: string | null; googleUrl?: string | null }) {
    if (business.placeId && /^ChI[\w-]+$/.test(business.placeId)) return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(business.placeId)}`;
    if (business.googleUrl) {
        try {
            const url = new URL(business.googleUrl);
            if (url.protocol === 'https:' && !url.username && !url.password && !url.port && (['maps.app.goo.gl', 'g.page', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com'].includes(url.hostname))) return url.href;
        } catch { /* The caller shows an actionable missing-link state. */ }
    }
    return null;
}
export function replySuggestion(rating: number) {
    // Deliberately generic. Never infer a medical relationship, treatment, or outcome.
    return rating >= 4 ? 'Thank you for taking the time to share your feedback. We appreciate your kind words.'
        : rating <= 2 ? 'Thank you for sharing your feedback. We’re sorry to hear about your experience. Please contact our team directly so we can listen and look into your concerns.'
        : 'Thank you for your feedback. We appreciate you taking the time to share it and would welcome any suggestions directly with our team.';
}
export async function syncReviews(businessId: string) {
    const link = await linkedBusiness(businessId);
    const reviews: any[] = [];
    let pageToken = '', total = 0, averageRating = 0;
    const seen = new Set<string>();
    do {
        const query = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc', ...(pageToken ? { pageToken } : {}) });
        const body = await businessRequest(`${link.parent}/reviews?${query}`, link.subject);
        reviews.push(...(Array.isArray(body.reviews) ? body.reviews : []));
        total = body.totalReviewCount ?? total; averageRating = body.averageRating ?? averageRating;
        pageToken = body.nextPageToken || '';
        if (pageToken && seen.has(pageToken)) throw new GbpError('PAGINATION', 'Google repeated a review page. Try syncing again.');
        seen.add(pageToken);
    } while (pageToken && reviews.length < 5000);
    const payload = { reviews, total, averageRating, complete: !pageToken };
    const contentEncrypted = await encrypt(JSON.stringify(payload));
    await prisma.$transaction(async tx => {
        const current = await tx.googleConnection.findUnique({ where: { id: 'local' } });
        const currentLink = await tx.googleBusinessLink.findUnique({ where: { businessId } });
        if (current?.subject !== link.subject || currentLink?.locationName !== link.locationName || currentLink.subject !== link.subject) throw new GbpError('CONNECTION_CHANGED', 'The Google connection changed. Sync again.', 409);
        const data = { subject: link.subject, locationName: link.locationName, contentEncrypted, expiresAt: new Date(Date.now() + 30 * 86400000), syncedAt: new Date() };
        await tx.googleReviewCache.upsert({ where: { businessId }, create: { businessId, ...data }, update: data });
    });
    return { count: reviews.length, complete: !pageToken };
}
export async function inbox(businessId: string) {
    const [cache, connection, link, analysis, drafts] = await Promise.all([
        prisma.googleReviewCache.findUnique({ where: { businessId } }),
        prisma.googleConnection.findUnique({ where: { id: 'local' }, select: { subject: true } }),
        prisma.googleBusinessLink.findUnique({ where: { businessId } }),
        prisma.reviewAnalysis.findFirst({ where: { savedBusinessId: businessId, status: { in: ['COMPLETED', 'PARTIAL'] } }, orderBy: { createdAt: 'desc' }, include: { reviews: true } }),
        prisma.replyDraft.findMany({ where: { businessId } }),
    ]);
    let synced: any = null;
    if (cache && cache.subject === connection?.subject && cache.subject === link?.subject && cache.locationName === link?.locationName && cache.expiresAt > new Date()) {
        try { synced = JSON.parse(await decrypt(cache.contentEncrypted)); } catch { /* Collect again if local cache is unavailable. */ }
    }
    const stars: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const rows: any[] = synced ? synced.reviews.map((r: any) => ({
        key: `google:${r.reviewId}`, source: 'GOOGLE', name: r.reviewer?.displayName || 'Google reviewer', rating: stars[r.starRating] || 0,
        text: r.comment || '', date: r.createTime, reply: r.reviewReply?.comment || '',
    })) : (analysis?.reviews || []).filter(r => !analysis?.currentRunId || r.runId === analysis.currentRunId).map(r => ({
        key: `collected:${r.id}`, source: 'COLLECTED', name: r.reviewerName, rating: r.rating, text: r.text || '', date: r.publishedDate, reply: r.responseText || '',
    }));
    return { source: synced ? 'GOOGLE' : 'COLLECTED', syncedAt: synced ? cache?.syncedAt : null, total: synced?.total ?? analysis?.totalReviews ?? 0,
        complete: synced?.complete ?? analysis?.collectionComplete ?? false,
        reviews: rows.map(r => ({ ...r, suggestion: replySuggestion(r.rating), draft: drafts.find(d => d.reviewKey === r.key) || null })) };
}
export async function saveReply(businessId: string, body: any) {
    const key = text(body.reviewKey, 'Review', 500), comment = text(body.comment, 'Reply', 4096);
    const current = await inbox(businessId);
    const review = current.reviews.find(r => r.key === key);
    if (!review) throw new GbpError('STALE_REVIEW', 'Refresh reviews before saving this reply.');
    const existing = await prisma.replyDraft.findUnique({ where: { businessId_reviewKey: { businessId, reviewKey: key } } });
    if (existing) {
        if (body.version !== existing.updatedAt.toISOString()) throw new GbpError('STALE_DRAFT', 'This reply changed. Reload before saving.', 409);
        const updated = await prisma.replyDraft.updateMany({ where: { id: existing.id, updatedAt: existing.updatedAt, status: { not: 'PUBLISHING' } }, data: { comment, status: 'DRAFT', error: null, publishedAt: null } });
        if (!updated.count) throw new GbpError('BUSY', 'This reply is being sent or changed. Refresh shortly.', 409);
        return prisma.replyDraft.findUnique({ where: { id: existing.id } });
    }
    try { return await prisma.replyDraft.create({ data: { businessId, reviewKey: key, source: review.source, comment } }); }
    catch { throw new GbpError('STALE_DRAFT', 'This reply was saved in another tab. Reload before editing.', 409); }
}
export async function publishReply(businessId: string, body: any) {
    if (body.approved !== true) throw new GbpError('APPROVAL_REQUIRED', 'Review the reply and approve publishing it to Google.');
    const draft = await prisma.replyDraft.findFirst({ where: { id: body.id, businessId } });
    if (!draft || draft.source !== 'GOOGLE') throw new GbpError('OFFICIAL_REVIEW_REQUIRED', 'Sync official Google reviews before publishing a reply.');
    if (body.version !== draft.updatedAt.toISOString()) throw new GbpError('STALE_DRAFT', 'This reply changed since you reviewed it. Reload and approve it again.', 409);
    const link = await linkedBusiness(businessId);
    const reviews = await inbox(businessId);
    if (!reviews.reviews.some(r => r.key === draft.reviewKey && r.source === 'GOOGLE')) throw new GbpError('STALE_REVIEW', 'Sync reviews again before publishing.');
    const reviewId = draft.reviewKey.slice(7);
    if (!/^[\w-]+$/.test(reviewId)) throw new GbpError('INVALID_REVIEW', 'This review identifier is invalid.');
    const claimed = await prisma.replyDraft.updateMany({ where: { id: draft.id, updatedAt: draft.updatedAt, status: { in: ['DRAFT', 'FAILED'] } }, data: { status: 'PUBLISHING', error: null } });
    if (!claimed.count) throw new GbpError('BUSY', 'This reply was already sent or changed. Reload before continuing.', 409);
    try {
        const live = await businessRequest(`${link.parent}/reviews/${reviewId}`, link.subject);
        const previous = reviews.reviews.find(r => r.key === draft.reviewKey)?.reply || '';
        if ((live.reviewReply?.comment || '') !== previous && live.reviewReply?.comment !== draft.comment) throw new GbpError('REVIEW_CHANGED', 'Someone changed the Google reply. Sync reviews, review the latest reply, then save a new draft.');
        if (live.reviewReply?.comment !== draft.comment)
        await businessRequest(`${link.parent}/reviews/${reviewId}/reply`, link.subject, 'PUT', { comment: draft.comment });
        await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    } catch (e) {
        const known = e instanceof GbpError ? e : new GbpError('DELIVERY_UNKNOWN', 'Check Google before trying this reply again.');
        await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: known.code === 'DELIVERY_UNKNOWN' ? 'CHECK_GOOGLE' : 'FAILED', error: known.message } });
        throw known;
    }
}
export function postInput(body: any) {
    const actionType = typeof body.actionType === 'string' ? body.actionType : 'NONE';
    if (!actions.includes(actionType)) throw new GbpError('INVALID_ACTION', 'Choose a supported post button.');
    const actionUrl = publicUrl(body.actionUrl, 'Button link');
    if (!['NONE', 'CALL'].includes(actionType) && !actionUrl) throw new GbpError('MISSING_URL', 'Add a link for this post button.');
    return { title: text(body.title, 'Internal title', 150), summary: text(body.summary, 'Post', 1500), actionType,
        actionUrl: ['NONE', 'CALL'].includes(actionType) ? null : actionUrl, imageUrl: publicUrl(body.imageUrl, 'Image link') };
}
export async function savePost(businessId: string, body: any) {
    await getBusiness(businessId);
    const data = postInput(body);
    if (!body.id) return prisma.businessPost.create({ data: { businessId, ...data } });
    if (!body.updatedAt || !Number.isFinite(new Date(body.updatedAt).getTime())) throw new GbpError('STALE_DRAFT', 'Reload this post before editing.', 409);
    const update = await prisma.businessPost.updateMany({ where: { id: body.id, businessId, updatedAt: new Date(body.updatedAt), status: { in: ['DRAFT', 'FAILED', 'SCHEDULED'] } }, data: { ...data, status: 'DRAFT', scheduledAt: null, approvedAt: null, approvedSubject: null, targetLocation: null, error: null } });
    if (!update.count) throw new GbpError('LOCKED_POST', 'This post was already sent or is being sent. Create a new draft instead.', 409);
    return prisma.businessPost.findUnique({ where: { id: body.id } });
}
export async function approvePost(businessId: string, body: any) {
    if (body.approved !== true) throw new GbpError('APPROVAL_REQUIRED', 'Review the post and approve publishing.');
    const link = await linkedBusiness(businessId);
    if (!body.version || !Number.isFinite(new Date(body.version).getTime())) throw new GbpError('STALE_DRAFT', 'Reload the post and review it before publishing.', 409);
    const date = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (!Number.isFinite(date.getTime()) || (body.scheduledAt && date.getTime() < Date.now() + 60000)) throw new GbpError('INVALID_DATE', 'Choose a schedule at least one minute in the future.');
    const result = await prisma.businessPost.updateMany({ where: { id: body.id, businessId, updatedAt: new Date(body.version), status: { in: ['DRAFT', 'FAILED'] } }, data: {
        status: 'SCHEDULED', scheduledAt: date, approvedAt: new Date(), approvedSubject: link.subject, targetLocation: link.locationName, error: null,
    } });
    if (!result.count) throw new GbpError('LOCKED_POST', 'This post changed or was already scheduled. Refresh the list.', 409);
    if (!body.scheduledAt) await publishPost(body.id);
}
export async function publishPost(id: string) {
    const post = await prisma.businessPost.findUnique({ where: { id } });
    if (!post || post.status !== 'SCHEDULED' || !post.approvedAt || !post.scheduledAt || post.scheduledAt > new Date()) return;
    const claim = await prisma.businessPost.updateMany({ where: { id, status: 'SCHEDULED', updatedAt: post.updatedAt }, data: { status: 'PUBLISHING' } });
    if (!claim.count) return;
    try {
        const link = await linkedBusiness(post.businessId);
        if (link.subject !== post.approvedSubject || link.locationName !== post.targetLocation) throw new GbpError('CONNECTION_CHANGED', 'The linked Google account or business changed. Review and approve this post again.');
        const data = postInput(post);
        const result = await businessRequest(`${link.parent}/localPosts`, link.subject, 'POST', {
            languageCode: 'en', topicType: 'STANDARD', summary: data.summary,
            ...(data.actionType === 'NONE' ? {} : { callToAction: { actionType: data.actionType, ...(data.actionUrl ? { url: data.actionUrl } : {}) } }),
            ...(data.imageUrl ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: data.imageUrl }] } : {}),
        });
        if (typeof result.name !== 'string' || !result.name.startsWith(`${link.parent}/localPosts/`)) throw new GbpError('DELIVERY_UNKNOWN', 'Google did not return a post identifier. Check Google before retrying.');
        await prisma.businessPost.update({ where: { id }, data: { status: result.state === 'REJECTED' ? 'REJECTED' : 'SUBMITTED', googleName: result.name, publishedAt: new Date(), error: result.state === 'REJECTED' ? 'Google rejected this post. Review it in your Business Profile.' : null } });
    } catch (e) {
        const known = e instanceof GbpError ? e : new GbpError('DELIVERY_UNKNOWN', 'Google delivery could not be confirmed. Check your profile first.');
        await prisma.businessPost.update({ where: { id }, data: { status: known.code === 'DELIVERY_UNKNOWN' ? 'CHECK_GOOGLE' : 'FAILED', error: known.message } });
        throw known;
    }
}
export async function runScheduledPosts() {
    const due = await prisma.businessPost.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } }, select: { id: true }, take: 10 });
    for (const post of due) { try { await publishPost(post.id); } catch { /* Per-post actionable error is persisted, never retried automatically. */ } }
}
export async function recoverPublishing() {
    await prisma.businessPost.updateMany({ where: { status: 'PUBLISHING' }, data: { status: 'CHECK_GOOGLE', error: 'The app restarted while sending this post. Check Google before creating another.' } });
    await prisma.replyDraft.updateMany({ where: { status: 'PUBLISHING' }, data: { status: 'CHECK_GOOGLE', error: 'The app restarted while sending this reply. Sync Google reviews to check the result.' } });
}
export function profileChecks(business: any) {
    return [
        { title: 'Business name', complete: !!business.name, action: 'Add the public business name.' },
        { title: 'Address', complete: !!business.address, action: 'Add the address, or confirm this is a service-area business.' },
        { title: 'Phone', complete: !!business.phone, action: 'Add the phone customers should call.' },
        { title: 'Website', complete: !!business.website, action: 'Add the correct website link.' },
        { title: 'Primary category', complete: !!business.category, action: 'Check that the category describes the main business.' },
        { title: 'Google Maps link', complete: !!reviewLink(business), action: 'Add a Google Maps link or Place ID.' },
        { title: 'Map coordinates', complete: business.lat != null && business.lng != null, action: 'Check the pin position before running rank scans.' },
    ];
}
