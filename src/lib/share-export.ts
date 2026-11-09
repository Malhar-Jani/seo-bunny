/** An allowlist export, deliberately not a restorable workspace backup. */
export function shareableReport(scans: any[]) {
    return { format: 'SEO-Bunny-shareable-report', version: 1, createdAt: new Date().toISOString(),
        scans: scans.map(scan => ({ keyword: scan.keyword, businessName: scan.businessName, createdAt: scan.createdAt,
            centerLat: scan.centerLat, centerLng: scan.centerLng, gridSize: scan.gridSize, radius: scan.radius,
            results: scan.results.map((r: any) => ({ lat: r.lat, lng: r.lng, rank: r.rank, captureStatus: r.captureStatus, capturedAt: r.capturedAt })) })),
    };
}
