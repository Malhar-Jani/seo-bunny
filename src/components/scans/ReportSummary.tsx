'use client';
import { useEffect, useState } from 'react';
import { scanSummary, type RankPoint } from '@/lib/rank-metrics';

export function ReportSummary({ id, runId, results, active, refresh }: { id: string; runId: string | null; results: RankPoint[]; active: boolean; refresh: () => void }) {
    const [summary, setSummary] = useState<ReturnType<typeof scanSummary> | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => {
        let live = true; setSummary(null);
        fetch(`/api/scans/${id}/insights${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(s => { if (live) setSummary(s); }).catch(() => {});
        return () => { live = false; };
    }, [id, runId, results.length, active]);
    const s = summary || scanSummary(results);
    async function retry() {
        setBusy(true); setError('');
        try { const res = await fetch(`/api/scans/${id}/retry-failed`, { method: 'POST' }); const data = await res.json(); if (!res.ok) throw Error(data.error); refresh(); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }
    return <section className="report-summary space-y-2" aria-label="Report summary">
        <div className="summary-primary"><p className="text-sm text-gray-600">{s.movement}</p>{(s.failed > 0 || s.unknown > 0) && <button disabled={busy || active} className="secondary-button" onClick={retry}>{busy ? 'Queuing retry…' : `Retry ${s.failed + s.unknown} unchecked locations`}</button>}</div>
        <details className="text-sm text-gray-600"><summary>About this report</summary><div className="space-y-2 mt-3 max-w-3xl"><p>{s.headline}</p>{s.weakestArea && <p>The {s.weakestArea.toLowerCase()} side has the lowest top-three coverage. Inspect its checkpoints and competitors before deciding what to improve.</p>}<p>{s.checked} checked · {s.failed} couldn’t check · {s.unknown} unknown. Percentages exclude unchecked locations. Average rank uses businesses found in the top 20.</p></div></details>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </section>;
}
