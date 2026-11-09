'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Plus, MapPin } from 'lucide-react';
import { FirstSteps } from '@/components/dashboard/FirstSteps';
import { useBusiness } from '@/components/layout/BusinessContext';
import { usePolling } from '@/hooks/usePolling';
const Map = dynamic(() => import('@/components/ui/Map'), { ssr: false, loading: () => <div className="map-loading">Loading map preview…</div> });
export default function DashboardPage() {
    const { businessId, ready, href } = useBusiness();
    const [data, setData] = useState<any>(null), [error, setError] = useState('');
    const revision = useRef(0);
    const load = useCallback(async () => {
        if (!ready) return;
        const current = ++revision.current;
        try { const res = await fetch('/api/dashboard' + (businessId ? '?businessId=' + encodeURIComponent(businessId) : '')); if (!res.ok) throw Error('Could not refresh your overview.'); const next = await res.json(); if (current === revision.current) { setData(next); setError(''); } }
        catch (e: any) { if (current === revision.current) setError(e.message); }
    }, [businessId, ready]);
    useEffect(() => { revision.current++; setData(null); void load(); }, [load]);
    usePolling(load, data?.activeScans ? 5000 : 60000);
    const latest = data?.latest;
    return <div className="overview-page space-y-6">
        <header className="page-heading"><div><h1>Overview</h1><p className="page-description">Your latest results and what needs a closer look.</p></div><Link href={href('/scans/new')} className="primary-button"><Plus size={16}/>New rank scan</Link></header>
        {error && <p role="alert" className="feedback-error">{error} <button onClick={() => void load()} className="underline">Retry</button></p>}
        {data && !data.scansCount && <FirstSteps empty/>}
        {!data && !error && <div className="loading-surface" role="status">Opening your workspace…</div>}
        {data && data.scansCount > 0 && <>
            <div className="overview-layout">
                <section className="surface overflow-hidden"><div className="section-toolbar"><div><h2 className="font-semibold">Latest scan</h2><p className="text-sm text-gray-600 mt-1">{latest?.keyword || 'No captured locations yet'}{latest?.businessName ? ` · ${latest.businessName}` : ''}</p></div>{latest && <Link href={`/scans/${latest.id}`} className="text-sm text-blue-700 flex items-center gap-1">Open report <ArrowRight size={15}/></Link>}</div>
                    {latest ? <><div className="overview-map"><Map center={[latest.centerLat, latest.centerLng]} zoom={12} points={latest.points}/></div><div className="metric-strip"><div><span>Top-three coverage</span><strong>{latest.metrics.top3Percent === null ? '—' : latest.metrics.top3Percent + '%'}</strong></div><div><span>Checked locations</span><strong>{latest.metrics.checked}/{latest.metrics.total}</strong></div><div><span>Average rank</span><strong>{latest.metrics.averageRank ? '#' + latest.metrics.averageRank : '—'}</strong></div></div></> : <div className="p-8 text-sm text-gray-600">Your map preview appears after the first checkpoints are captured.</div>}
                </section>
                <aside className="overview-attention"><h2 className="font-semibold">Needs attention</h2>{!data.attention.length && !data.reviewIssues ? <p className="text-sm text-gray-600 mt-3">No issues in your recent scans or review reports.</p> : <div className="divide-y divide-gray-200 mt-2">{data.attention.slice(0, 4).map((s: any) => <Link href={`/scans/${s.id}`} key={s.id} className="block py-4"><p className="text-sm font-medium">{s.keyword}</p><p className="text-sm text-gray-600 mt-1">{s.reason}</p></Link>)}{data.reviewIssues > 0 && <Link href={href('/reviews')} className="block py-4 text-sm text-blue-700">{data.reviewIssues} review reports need attention</Link>}</div>}<div className="border-t border-gray-200 mt-6 pt-5 text-sm text-gray-600 space-y-3"><p>{data.scansCount} saved scans · {data.activeScans} in progress</p><Link href={href('/schedules')} className="inline-flex gap-2 items-center text-blue-700">Manage scan schedules <ArrowRight size={14}/></Link></div></aside>
            </div>
            <section><div className="section-toolbar px-0"><h2 className="font-semibold">Businesses</h2><Link href="/businesses" className="text-sm text-blue-700">Manage businesses</Link></div>{data.businesses.length ? <div className="surface divide-y divide-gray-200">{data.businesses.map((b: any) => <Link href={`/businesses?businessId=${b.id}`} key={b.id} className="business-row"><div><h3>{b.name}</h3><p>{b.address || 'Address not added'}</p></div><span>{b.latest ? `${b.latest.metrics.top3Percent ?? '—'}% top-three coverage` : 'No linked scan yet'}</span><ArrowRight size={16}/></Link>)}</div> : <p className="text-sm text-gray-600">Save a business to keep its scans, reviews, and reports together. <Link href="/businesses" className="text-blue-700 underline">Add business</Link></p>}</section>
            <section><div className="section-toolbar px-0"><h2 className="font-semibold">Recent scans</h2><Link href={href('/scans')} className="text-sm text-blue-700">View all</Link></div><div className="surface divide-y divide-gray-200">{data.recentScans.slice(0, 5).map((s: any) => <Link key={s.id} href={`/scans/${s.id}`} className="business-row"><div><h3>{s.keyword}</h3><p>{new Date(s.createdAt).toLocaleDateString()} · {s.businessName || 'Unassigned business'}</p></div><span className="status-pill bg-gray-100">{s.status.toLowerCase()}</span><ArrowRight size={16}/></Link>)}</div></section>
        </>}
    </div>;
}
