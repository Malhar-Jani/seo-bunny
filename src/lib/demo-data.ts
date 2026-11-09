// Fictional fixtures only. No customer data, remote scans or database writes.
export const demoBusiness = { name: 'Juniper Cycle Studio (fictional)', keyword: 'bicycle repair', lat: 23.2156, lng: 72.6369 };
export function demoPoints(run: number) {
    return Array.from({ length: 25 }, (_, i) => {
        const row = Math.floor(i / 5), col = i % 5;
        const rank = Math.min(20, Math.max(1, Math.abs(row - 2) * 2 + col * 2 + 1 - run * 2));
        return { id: `demo-${i}`, lat: demoBusiness.lat + (row - 2) * 0.007, lng: demoBusiness.lng + (col - 2) * 0.007,
            rank: i === 24 ? null : rank, captureStatus: i === 24 ? 'FAILED' : 'CHECKED', hasData: true,
            topResults: JSON.stringify([{ name: demoBusiness.name, rank, rating: 4.7, reviews: 86 }, { name: 'Wheelhouse Workshop (fictional)', rank: rank === 1 ? 2 : 1, rating: 4.6, reviews: 124 }]),
        };
    });
}
export const demoReviews = [
    { name: 'Sample customer A', rating: 5, text: 'They explained the repair clearly and had my bicycle ready the same afternoon.', theme: 'Clear communication · Fast service' },
    { name: 'Sample customer B', rating: 3, text: 'The repair was good, but I waited longer than the estimate.', theme: 'Waiting time' },
    { name: 'Sample customer C', rating: 5, text: 'Friendly team and a fair price for a new chain.', theme: 'Staff · Value' },
];
