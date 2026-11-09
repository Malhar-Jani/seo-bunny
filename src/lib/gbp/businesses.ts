import { prisma } from '../prisma';
import { accessToken } from './oauth';
import { decrypt, encrypt, GbpError } from './security';

type GoogleAccount = { name: string; accountName: string; type?: string; role?: string };
type Location = {
    name: string; title: string; storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string; regionCode?: string };
    phoneNumbers?: { primaryPhone?: string }; websiteUri?: string; latlng?: { latitude: number; longitude: number };
    categories?: { primaryCategory?: { displayName?: string } }; metadata?: { placeId?: string; mapsUri?: string };
};
export type BusinessProfile = { placeId: string | null; address: string | null; phone: string | null; website: string | null; category: string | null; googleUrl: string | null; lat: number | null; lng: number | null };
export type DiscoveredBusiness = { locationName: string; title: string; profile: BusinessProfile; importedBusinessId: string | null };

async function googleGet(url: URL, subject: string) {
    let auth = await accessToken();
    if (auth.subject !== subject) throw new GbpError('CONNECTION_CHANGED', 'The connected Google account changed. Reload this page.', 409);
    const request = (token: string) => fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20000), redirect: 'error' });
    let response: Response;
    try {
        response = await request(auth.token);
        if (response.status === 401) {
            auth = await accessToken(true);
            if (auth.subject !== subject) throw new GbpError('CONNECTION_CHANGED', 'The connected Google account changed. Reload this page.', 409);
            response = await request(auth.token);
        }
    } catch (error) {
        if (error instanceof GbpError) throw error;
        throw new GbpError('GOOGLE_UNAVAILABLE', 'Google did not respond. Check your connection and try again.', 502);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401) throw new GbpError('RECONNECT', 'Reconnect your Google account to continue.', 401);
        if (response.status === 403) {
            const disabled = body.error?.details?.some((d: any) => ['SERVICE_DISABLED', 'API_DISABLED'].includes(d.reason));
            throw new GbpError(disabled ? 'API_DISABLED' : 'ACCESS_REQUIRED', disabled
                ? 'Enable My Business Account Management API and My Business Business Information API in your Google Cloud project, then try again.'
                : 'Google denied Business Profile access. Check project API approval, the connected account’s manager role, and any Workspace restrictions.', 403);
        }
        if (response.status === 429) throw new GbpError('QUOTA', 'Google’s request quota was reached. If this project has a quota of 0, request Business Profile API approval. Otherwise wait before retrying.', 429);
        throw new GbpError('GOOGLE_API', response.status >= 500 ? 'Google’s Business Profile service is temporarily unavailable. Try again shortly.' : 'Google could not load these businesses. Check account access and API setup.', 502);
    }
    return body;
}
async function pages<T>(url: URL, field: string, subject: string): Promise<T[]> {
    const items: T[] = [], seen = new Set<string>();
    for (let page = 0; page < 500; page++) {
        const data = await googleGet(url, subject);
        items.push(...(Array.isArray(data[field]) ? data[field] : []));
        if (!data.nextPageToken) return items;
        if (seen.has(data.nextPageToken)) throw new GbpError('PAGINATION', 'Google returned an incomplete business list. Try again.', 502);
        seen.add(data.nextPageToken); url.searchParams.set('pageToken', data.nextPageToken);
    }
    throw new GbpError('PAGINATION', 'This Google account has too many results to load at once. Choose a smaller location group.', 400);
}
async function subject() {
    const current = await prisma.googleConnection.findUnique({ where: { id: 'local' }, select: { subject: true } });
    if (!current) throw new GbpError('NOT_CONNECTED', 'Connect your manager Google account first.', 401);
    return current.subject;
}
export async function listAccounts() {
    const owner = await subject();
    const url = new URL('https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20');
    const accounts = await pages<GoogleAccount>(url, 'accounts', owner);
    return accounts.map(a => ({ name: a.name, title: a.accountName || a.name, type: a.type, role: a.role }));
}
function profile(location: Location): BusinessProfile {
    const address = location.storefrontAddress;
    return {
        placeId: location.metadata?.placeId || null,
        address: address ? [...(address.addressLines || []), address.locality, address.administrativeArea, address.postalCode, address.regionCode].filter(Boolean).join(', ') : null,
        phone: location.phoneNumbers?.primaryPhone || null, website: location.websiteUri || null,
        category: location.categories?.primaryCategory?.displayName || null,
        googleUrl: location.metadata?.mapsUri || (location.metadata?.placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.title)}&query_place_id=${encodeURIComponent(location.metadata.placeId)}` : null),
        lat: location.latlng?.latitude ?? null, lng: location.latlng?.longitude ?? null,
    };
}
export async function discoverBusinesses(accountName: string) {
    if (!/^accounts\/\d+$/.test(accountName)) throw new GbpError('INVALID_ACCOUNT', 'Choose a Google Business Profile account.');
    const owner = await subject();
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('readMask', 'name,title,storefrontAddress,phoneNumbers,websiteUri,latlng,categories,metadata');
    const locations = await pages<Location>(url, 'locations', owner);
    const links = await prisma.googleBusinessLink.findMany({ where: { subject: owner }, select: { locationName: true, businessId: true } });
    const businesses = [...new Map(locations.filter(l => /^locations\/\d+$/.test(l.name)).map(l => [l.name, l])).values()].map(l => ({
        locationName: l.name, title: l.title, profile: profile(l), importedBusinessId: links.find(link => link.locationName === l.name)?.businessId || null,
    }));
    return { subject: owner, businesses };
}
export async function importBusinesses(accountName: unknown, selected: unknown) {
    if (typeof accountName !== 'string' || !Array.isArray(selected) || !selected.length || selected.length > 100) throw new GbpError('INVALID_SELECTION', 'Select between 1 and 100 businesses to import.');
    const selection: { locationName: string; label: string }[] = selected.map(row => {
        if (!row || typeof row.locationName !== 'string' || !/^locations\/\d+$/.test(row.locationName) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 200) throw new GbpError('INVALID_SELECTION', 'Give each selected business a workspace name.');
        return { locationName: row.locationName, label: row.label.trim() };
    });
    if (new Set(selection.map(s => s.locationName)).size !== selection.length) throw new GbpError('INVALID_SELECTION', 'The same business was selected more than once.');
    // Refresh from Google instead of trusting profile details supplied by a browser.
    const discovered = await discoverBusinesses(accountName);
    const expiry = new Date(Date.now() + 30 * 86400000);
    const rows = await Promise.all(selection.map(async row => {
        const business = discovered.businesses.find(b => b.locationName === row.locationName);
        if (!business) throw new GbpError('BUSINESS_ACCESS', 'A selected business is no longer accessible. Reload the list.');
        return { ...row, profile: business.profile, encrypted: await encrypt(JSON.stringify(business.profile)) };
    }));
    return prisma.$transaction(async tx => {
        const current = await tx.googleConnection.findUnique({ where: { id: 'local' } });
        if (current?.subject !== discovered.subject) throw new GbpError('CONNECTION_CHANGED', 'The Google account changed. Reload the list.', 409);
        let created = 0, linked = 0;
        for (const row of rows) {
            const existing = await tx.googleBusinessLink.findUnique({ where: { subject_locationName: { subject: current.subject, locationName: row.locationName } } });
            let businessId = existing?.businessId;
            if (!businessId) {
                const match = row.profile.placeId ? await tx.savedBusiness.findFirst({ where: { placeId: row.profile.placeId, googleLink: null } }) : null;
                if (match) { businessId = match.id; linked++; }
                else {
                    // This is the user's chosen workspace label, not a permanent API cache.
                    businessId = (await tx.savedBusiness.create({ data: { name: row.label } })).id; created++;
                }
            }
            const data = { accountName, profileEncrypted: row.encrypted, profileExpiresAt: expiry };
            await tx.googleBusinessLink.upsert({ where: { businessId }, create: { businessId, subject: current.subject, locationName: row.locationName, ...data }, update: data });
        }
        return { created, linked, refreshed: rows.length - created - linked };
    });
}
export async function purgeGoogleCache() {
    await prisma.googleReviewCache.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await prisma.googleBusinessLink.updateMany({ where: { profileExpiresAt: { lte: new Date() } }, data: { profileEncrypted: null, profileExpiresAt: null } });
    await prisma.googleOAuthAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
export async function withGoogleProfiles<T extends { id: string }>(businesses: T[]) {
    if (!businesses.length) return businesses;
    const [links, current] = await Promise.all([
        prisma.googleBusinessLink.findMany({ where: { businessId: { in: businesses.map(b => b.id) } } }),
        prisma.googleConnection.findUnique({ where: { id: 'local' }, select: { subject: true } }),
    ]);
    return Promise.all(businesses.map(async business => {
        const link = links.find(l => l.businessId === business.id);
        if (!link) return business;
        let profile: BusinessProfile | null = null;
        const connected = current?.subject === link.subject;
        if (connected && link.profileEncrypted && link.profileExpiresAt && link.profileExpiresAt.getTime() > Date.now()) {
            try { profile = JSON.parse(await decrypt(link.profileEncrypted)); } catch { /* Keep user-entered data usable if the key was lost. */ }
        }
        const result = { ...business } as T & Record<string, any>;
        for (const [key, value] of Object.entries(profile || {})) if ((result as any)[key] == null) (result as any)[key] = value;
        return { ...result, google: { connected, needsRefresh: !profile, syncedAt: link.updatedAt, localProfile: business } };
    }));
}
