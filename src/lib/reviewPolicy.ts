import type { ScrapedReview } from './reviewScraper';

export function collectionCoverage(collected: number, expected: number) {
    return { collected, expected, complete: expected > 0 && collected >= expected,
        percent: expected > 0 ? Math.min(100, Math.round(collected / expected * 100)) : null };
}

export function supportedSentimentText(text?: string) {
    if (!text?.trim()) return false;
    // Avoid presenting an English lexicon as a Hindi/Gujarati sentiment model.
    const letters = text.match(/\p{L}/gu) || [];
    const latin = text.match(/[a-z]/gi) || [];
    return letters.length > 0 && latin.length / letters.length >= 0.8;
}

export function deduplicateReviewCollection(reviews: ScrapedReview[]) {
    const seen = new Set<string>();
    return reviews.filter(review => {
        const key = review.reviewId || `${review.reviewerUrl || review.reviewerName}|${review.rating}|${review.publishedDate || ''}|${review.text || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function validateMapsUrl(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Paste a Google Maps business link.');
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid Google Maps URL.'); }
    const allowed = url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl' ||
        /^(www\.|maps\.)?google\.(com|co\.in|co\.uk|com\.au|ca|de|fr)$/.test(url.hostname);
    if (url.protocol !== 'https:' || !allowed || url.username || url.password || (url.port && url.port !== '443')) {
        throw new Error('Use an HTTPS Google Maps business link.');
    }
    return url.toString();
}

/** Keep legacy saved reports from presenting rule-based scores as proof. */
export function clarifyReviewCopy(json: string | null) {
    return json?.replaceAll('Very authentic review base', 'Few pattern flags in this sample')
        .replaceAll('Likely Real', 'Few patterns').replaceAll('Likely Fake', 'Many patterns')
        .replaceAll('potentially inauthentic', 'worth checking manually')
        .replaceAll('Report suspicious reviews to Google.', 'Check flagged reviews manually before deciding whether any action is appropriate.');
}
