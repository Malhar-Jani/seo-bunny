'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/components/layout/BusinessContext';
import { Building2, Plus, MapPin, MessageSquareText, ArrowUpRight, X, Pencil } from 'lucide-react';
const blank = { name: '', address: '', phone: '', website: '', category: '', googleUrl: '', placeId: '', notes: '', lat: '', lng: '' };
export default function BusinessesPage() {
    const { businessId: activeBusinessId, chooseBusiness } = useBusiness();
    useEffect(() => { setSelected(activeBusinessId); }, [activeBusinessId]);
    const [businesses, setBusinesses] = useState<any[]>([]);
    const [selected, setSelected] = useState('');
    const [workspace, setWorkspace] = useState<any>(null);
    const [form, setForm] = useState<any>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    function editBusiness() {
        const business = workspace.business.google?.localProfile || workspace.business;
        setForm({ ...business, lat: business.lat ?? '', lng: business.lng ?? '' });
    }
    async function load() {
        const res = await fetch('/api/businesses');
        if (!res.ok) throw new Error('Could not load businesses.');
        const rows = (await res.json()).businesses; setBusinesses(rows); const wanted = new URLSearchParams(location.search).get('businessId'); if (rows.some((b: any) => b.id === wanted)) setSelected(wanted!); setLoading(false);
    }
    useEffect(() => { load().catch(e => { setError(e.message); setLoading(false); }); }, []);
    useEffect(() => {
        setWorkspace(null);
        if (!selected) return;
        const controller = new AbortController();
        fetch(`/api/businesses/${selected}/workspace`, { signal: controller.signal }).then(r => r.json()).then(setWorkspace).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
        return () => controller.abort();
    }, [selected]);
    async function save(e: React.FormEvent) {
        e.preventDefault(); setBusy(true); setError('');
        try {
            const res = await fetch('/api/businesses', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, lat: form.lat === '' || form.lat == null ? null : Number(form.lat), lng: form.lng === '' || form.lng == null ? null : Number(form.lng) }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setForm(null); await load(); setSelected(data.id);
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }
    return <div className="space-y-8">
        <header className="page-heading"><div><p className="eyebrow">One place for each client</p><h1>Your businesses</h1><p className="page-description">Keep rankings, reviews, and reports connected.</p></div><div className="flex flex-wrap gap-3"><Link href="/settings/google" className="secondary-button">Connect Google</Link><button className="primary-button" onClick={() => setForm({ ...blank })}><Plus size={16} />Add business</button></div></header>
        {error && <p role="alert" className="bg-red-50 text-red-800 p-4 rounded-xl">{error}</p>}
        {form && <section className="surface p-6"><div className="flex justify-between mb-5"><h2 className="font-semibold">{form.id ? 'Edit business' : 'A new business'}</h2><button onClick={() => setForm(null)} aria-label="Close form"><X size={20} /></button></div><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">{[['name','Business name'],['address','Address'],['phone','Phone'],['website','Website'],['category','Primary category'],['googleUrl','Google Maps link'],['placeId','Place ID (optional)'],['lat','Latitude (optional)'],['lng','Longitude (optional)']].map(([key,label]) => <label key={key} className="text-xs text-gray-600 space-y-2">{label}<input className="field w-full" required={key === 'name'} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}<label className="sm:col-span-2 text-xs text-gray-600 space-y-2">Notes<textarea className="field w-full" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><div><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save business'}</button></div></form></section>}
        {loading ? <p className="text-gray-500">Loading businesses…</p> : !businesses.length ? <div className="surface text-center p-12"><Building2 className="mx-auto text-gray-400 mb-4" size={32} /><h2 className="font-semibold">Make this workspace yours.</h2><p className="text-sm text-gray-500 mt-2">Save your first business to start keeping its SEO work together.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{businesses.map(b => <button key={b.id} onClick={() => { setSelected(b.id); chooseBusiness(b.id); }} className={`surface text-left p-6 transition-colors hover:border-blue-400 ${selected === b.id ? 'ring-1 ring-blue-500' : ''}`}><Building2 size={20} className="text-blue-700 mb-4" /><h2 className="font-semibold">{b.name}</h2><p className="text-sm text-gray-500 mt-2 line-clamp-2">{b.address || 'Address not added'}</p><p className="text-xs text-blue-700 mt-5">Open workspace ↗</p></button>)}</div>}
        {selected && !workspace && <p className="text-gray-500">Opening workspace…</p>}
        {workspace?.business && <section className="surface p-5 sm:p-7 space-y-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Business workspace</p><h2 className="text-2xl font-semibold">{workspace.business.name}</h2><p className="text-sm text-gray-500 mt-2">{workspace.business.address}</p>{workspace.business.notes && <p className="text-sm text-gray-600 mt-3">{workspace.business.notes}</p>}</div><button className="secondary-button" onClick={editBusiness}><Pencil size={14} />Edit</button></div>
            {workspace.business.google && <p className="text-sm text-gray-600">{!workspace.business.google.connected ? 'Google is disconnected for this business.' : workspace.business.google.needsRefresh ? 'Google details need a refresh.' : 'Linked to Google Business Profile.'} <Link href="/settings/google" className="text-blue-700 underline underline-offset-4">Manage connection</Link></p>}
            <div className="flex flex-wrap gap-3"><Link className="primary-button" href={`/scans/new?businessId=${selected}`}><MapPin size={15} />New rank scan</Link><Link className="secondary-button" href={`/reviews?businessId=${selected}`}><MessageSquareText size={15} />Analyze reviews</Link><Link className="secondary-button" href={`/growth?businessId=${selected}`}>Client growth <ArrowUpRight size={15} /></Link></div>
            <div className="grid gap-6 md:grid-cols-2">{[['Rank scans', workspace.scans, '/scans/'], ['Review reports', workspace.reviews, '/reviews/']].map(([title, records, prefix]: any) => <div key={title}><h3 className="text-sm font-semibold mb-3">{title}</h3>{!records.length ? <p className="text-sm text-gray-500">Nothing here yet.</p> : <div className="divide-y divide-gray-100">{records.map((r: any) => <Link key={r.id} href={prefix + r.id} className="flex gap-3 justify-between items-center py-3"><div className="min-w-0"><p className="text-sm truncate">{r.keyword || r.businessName}</p><p className="text-xs text-gray-500 mt-1">{new Date(r.createdAt).toLocaleDateString()} · {r.status.toLowerCase()}</p></div><ArrowUpRight size={15} className="shrink-0 text-gray-400" /></Link>)}</div>}</div>)}</div>
        </section>}
    </div>;
}
