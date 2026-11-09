'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/components/layout/BusinessContext';
import { MessageSquareText, Search, ArrowUpRight, RefreshCw, Square, Trash2, Loader2, Star, Building2 } from 'lucide-react';
import { usePolling } from '@/hooks/usePolling';

const active = ['QUEUED', 'SCRAPING', 'ANALYZING'];
export default function ReviewsPage() {
    const { businessId: activeBusinessId, chooseBusiness } = useBusiness();
    const scopeRef = useRef(activeBusinessId); scopeRef.current = activeBusinessId;
    const [analyses, setAnalyses] = useState<any[]>([]);
    const [businesses, setBusinesses] = useState<any[]>([]);
    const [businessId, setBusinessId] = useState('');
    const [url, setUrl] = useState('');
    const [preview, setPreview] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const running = analyses.some(a => active.includes(a.status));
    async function load() {
        try {
            const response = await fetch('/api/reviews' + (activeBusinessId ? '?businessId=' + encodeURIComponent(activeBusinessId) : ''));
            if (!response.ok) throw new Error('Could not load analyses. Try refreshing.');
            const rows = await response.json(); if (scopeRef.current === activeBusinessId) setAnalyses(rows);
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }
    usePolling(load, running ? 3000 : 60000);
    useEffect(() => { setAnalyses([]); setBusinessId(activeBusinessId); void load(); }, [activeBusinessId]);
    useEffect(() => {
        fetch('/api/businesses').then(r => r.json()).then(data => {
            setBusinesses(data.businesses || []);
            const id = new URLSearchParams(window.location.search).get('businessId');
            const business = data.businesses?.find((b: any) => b.id === id);
            if (business) { setBusinessId(business.id); setUrl(business.googleUrl || ''); }
        }).catch(() => {});
    }, []);
    function selectBusiness(id: string) {
        setBusinessId(id); setPreview(null);
        setUrl(businesses.find(b => b.id === id)?.googleUrl || '');
    }
    async function lookUp() {
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/reviews/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
            const data = await response.json();
            if (!response.ok || !data.name || data.name === 'Unknown Business') throw new Error(data.error || 'Could not identify that business. Check its Maps link.');
            setPreview({ ...data, url });
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }
    async function start() {
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...preview, businessName: preview.name, savedBusinessId: businessId || undefined }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            setPreview(null); setUrl(''); await load();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }
    async function action(id: string, type: 'rerun' | 'cancel' | 'delete') {
        if (type === 'delete' && !confirm('Delete this review analysis and its history?')) return;
        try {
            const response = await fetch(`/api/reviews/${id}${type === 'delete' ? '' : '/' + type}`, { method: type === 'delete' ? 'DELETE' : 'POST' });
            if (!response.ok) throw new Error((await response.json()).error || 'Please try again.');
            await load();
        } catch (e: any) { setError(e.message); }
    }
    const visible = analyses.filter(a => (!businessId || a.savedBusinessId === businessId) && a.businessName.toLowerCase().includes(search.toLowerCase()));
    return <div className="space-y-8">
        <header className="page-heading"><div><p className="eyebrow">Listen, understand, improve</p><h1>Customer reviews</h1><p className="page-description">See what customers are saying, and what needs your attention.</p></div><span className="heading-icon"><MessageSquareText size={25} strokeWidth={1.5} /></span></header>
        <section className="surface p-5 sm:p-7">
            <div className="flex items-center gap-2 mb-1 font-semibold"><Building2 size={18} /><h2>Start with a business</h2></div>
            <p className="text-sm text-gray-500 mb-5">Choose a saved business or paste its Google Maps link.</p>
            <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)_auto]">
                <select aria-label="Saved business" className="field" value={businessId} onChange={e => selectBusiness(e.target.value)}><option value="">Any business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                <input aria-label="Google Maps business URL" className="field min-w-0" placeholder="Paste a Google Maps business link" value={url} onChange={e => { setUrl(e.target.value); setPreview(null); }} onKeyDown={e => { if (e.key === 'Enter' && !busy && url) void lookUp(); }} />
                <button className="primary-button justify-center" disabled={busy || !url.trim()} onClick={lookUp}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}Look up business</button>
            </div>
            {preview && <div className="mt-5 rounded-xl bg-gray-50 border border-gray-200 p-5 flex flex-col sm:flex-row gap-4 justify-between"><div><h3 className="font-semibold">{preview.name}</h3><p className="text-sm text-gray-500 mt-1">{preview.address}</p><p className="text-sm mt-2 flex gap-2 items-center"><Star size={14} />{preview.averageRating} · {preview.totalReviews?.toLocaleString()} reviews on Google</p><p className="text-xs text-gray-500 mt-2">Collection runs in the background. You can leave this page.</p></div><div className="flex gap-2 items-center"><button className="secondary-button" onClick={() => setPreview(null)}>Cancel</button><button className="primary-button" disabled={busy} onClick={start}>Start analysis <ArrowUpRight size={15} /></button></div></div>}
        </section>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-4 text-sm flex justify-between gap-3">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        <section>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="text-lg font-semibold">Your analyses <span className="text-gray-400 font-normal text-sm ml-2">{visible.length}</span></h2><input className="field w-full sm:w-64" aria-label="Search analyses" placeholder="Find a business…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            {loading ? <p className="text-gray-500 py-8">Loading analyses…</p> : !visible.length ? <div className="surface py-14 px-6 text-center"><MessageSquareText className="mx-auto mb-4 text-gray-400" size={32} strokeWidth={1.3} /><h3 className="font-semibold">A clearer picture starts here.</h3><p className="text-sm text-gray-500 mt-2">Add a business above to see review patterns, unanswered feedback, and next steps.</p><Link className="inline-block mt-5 text-blue-700 text-sm underline underline-offset-4" href="/businesses">Manage your businesses</Link></div> : <div className="space-y-3">{visible.map(a => {
                const working = active.includes(a.status);
                const report = ['COMPLETED', 'PARTIAL'].includes(a.status);
                const status = { COMPLETED: 'Collected', PARTIAL: 'Partial collection', CANCELLED: 'Cancelled', INTERRUPTED: 'Interrupted', QUEUED: 'Queued', SCRAPING: 'Collecting reviews', ANALYZING: 'Finding patterns', FAILED: 'Needs retry' }[a.status] || a.status;
                return <article key={a.id} className="surface p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2 items-center"><h3 className="font-semibold break-words">{a.businessName}</h3><span className={`status-pill ${a.status === 'PARTIAL' || a.status === 'FAILED' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{working && <Loader2 size={12} className="animate-spin" />}{status}</span></div><p className="text-xs text-gray-500 mt-2">{new Date(a.createdAt).toLocaleDateString()} · {a.collectedReviews || 0} collected{a.totalReviews > 0 ? ` of ${a.totalReviews.toLocaleString()} on Google` : ' · total not confirmed'}</p>{a.error && <p className="text-sm text-amber-800 mt-2">{a.error}</p>}</div>
                    <div className="flex items-center gap-2 flex-wrap">{report && <Link href={`/reviews/${a.id}`} className="primary-button">View findings <ArrowUpRight size={15} /></Link>}{working ? <button className="secondary-button" disabled={a.job?.cancelRequested} onClick={() => action(a.id, 'cancel')}><Square size={13} />{a.job?.cancelRequested ? 'Stopping…' : 'Stop'}</button> : <><button className="secondary-button" onClick={() => action(a.id, 'rerun')}><RefreshCw size={14} />{report ? 'Refresh' : 'Retry'}</button><button className="p-2.5 rounded-lg text-gray-400 hover:text-red-700" aria-label={`Delete ${a.businessName}`} onClick={() => action(a.id, 'delete')}><Trash2 size={16} /></button></>}</div></div>
                    {working && <p role="status" className="text-sm text-gray-600 mt-4 border-t border-gray-100 pt-3">{a.job?.stage || 'Waiting to start…'}</p>}
                    {a.job?.logs && a.job.logs !== '[]' && <details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer">Collection details</summary><div className="max-h-40 overflow-auto mt-2 space-y-1">{JSON.parse(a.job.logs).map((line: any, i: number) => <p key={i}>{line.msg}</p>)}</div></details>}
                </article>;
            })}</div>}
        </section>
    </div>;
}

