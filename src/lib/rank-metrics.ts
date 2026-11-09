export type RankPoint = { lat?: number; lng?: number; rank: number | null; captureStatus?: string; topResults?: string };

export function captureStatus(point: RankPoint): 'CHECKED' | 'FAILED' | 'UNKNOWN' {
    if (point.captureStatus === 'FAILED') return 'FAILED';
    if (point.captureStatus === 'CHECKED') return 'CHECKED';
    // Older empty captures cannot establish whether Google was checked successfully.
    if (point.rank !== null) return 'CHECKED';
    try { if (JSON.parse(point.topResults || '[]').length) return 'CHECKED'; } catch { /* unknown legacy data */ }
    return 'UNKNOWN';
}
export const isChecked = (point: RankPoint) => captureStatus(point) === 'CHECKED';
export function rankMetrics(points: RankPoint[]) {
    const checked = points.filter(isChecked);
    const ranked = checked.filter(p => p.rank !== null && p.rank >= 1 && p.rank <= 20);
    const top3 = ranked.filter(p => p.rank! <= 3).length;
    return {
        total: points.length, checked: checked.length,
        failed: points.filter(p => captureStatus(p) === 'FAILED').length,
        unknown: points.filter(p => captureStatus(p) === 'UNKNOWN').length,
        ranked: ranked.length, top3,
        top3Percent: checked.length ? Math.round(top3 / checked.length * 1000) / 10 : null,
        averageRank: ranked.length ? Math.round(ranked.reduce((sum, p) => sum + p.rank!, 0) / ranked.length * 10) / 10 : null,
    };
}
export function scanSummary(current: RankPoint[], previous: RankPoint[] = [], center = { lat: 0, lng: 0 }) {
    const metrics = rankMetrics(current);
    const key = (p: RankPoint) => `${p.lat?.toFixed(6)},${p.lng?.toFixed(6)}`;
    const old = new Map(previous.filter(isChecked).map(p => [key(p), p]));
    const matched = current.filter(p => isChecked(p) && old.has(key(p)));
    const before = rankMetrics(matched.map(p => old.get(key(p))!));
    const after = rankMetrics(matched);
    const change = matched.length && before.top3Percent !== null && after.top3Percent !== null
        ? Math.round((after.top3Percent - before.top3Percent) * 10) / 10 : null;
    const sides = ['North', 'East', 'South', 'West'].map(name => {
        const subset = current.filter(p => name === 'North' ? p.lat! > center.lat : name === 'South' ? p.lat! < center.lat : name === 'East' ? p.lng! > center.lng : p.lng! < center.lng);
        return { name, ...rankMetrics(subset) };
    }).filter(s => s.checked >= 2).sort((a, b) => a.top3Percent! - b.top3Percent!);
    return { ...metrics, matchedPoints: matched.length, change, weakestArea: sides[0]?.name ?? null,
        headline: metrics.top3Percent === null ? 'No verified checkpoints yet.' : `Top-three coverage is ${metrics.top3Percent}% across ${metrics.checked} checked checkpoints.`,
        movement: change === null ? 'Run another scan over the same checkpoints to measure change.' : `Top-three coverage ${change > 0 ? 'increased' : change < 0 ? 'decreased' : 'held steady'}${change ? ` by ${Math.abs(change)} percentage points` : ''} across ${matched.length} matching checkpoints.`,
    };
}
