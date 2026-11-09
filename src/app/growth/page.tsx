'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBusiness } from '@/components/layout/BusinessContext';
import { ArrowUpRight, MessageSquareText, CalendarDays, QrCode, ClipboardCheck, Users, Sprout } from 'lucide-react';
import { ReviewInbox, PostStudio, ReviewStudio, ProfileChecklist, Contacts } from './panels';

export type GrowthData = { business: any; inbox: any; posts: any[]; contacts: any[]; reviewLink: string | null; checks: any[] };
export type PanelProps = { data: GrowthData; busy: boolean; act: (action: string, body?: any) => Promise<any> };
const tabs = [['inbox', 'Review inbox', MessageSquareText], ['posts', 'Posts & calendar', CalendarDays], ['qr', 'Review QR', QrCode], ['checks', 'Profile checks', ClipboardCheck], ['contacts', 'Contacts', Users]] as const;
export default function GrowthPage() {
    const { businessId: activeBusinessId, chooseBusiness } = useBusiness();
    useEffect(() => { if (activeBusinessId) setSelected(activeBusinessId); }, [activeBusinessId]);
    const [businesses, setBusinesses] = useState<any[]>([]);
    const [selected, setSelected] = useState('');
    const [tab, setTab] = useState('inbox');
    const [data, setData] = useState<GrowthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/businesses', { signal: controller.signal }).then(async r => {
            if (!r.ok) throw Error('Could not load businesses.');
            const result = await r.json(); setBusinesses(result.businesses || []);
            const params = new URLSearchParams(location.search);
            const wanted = params.get('businessId') || localStorage.getItem('growth-business');
            setSelected(result.businesses.find((b: any) => b.id === wanted)?.id || result.businesses[0]?.id || '');
            if (tabs.some(t => t[0] === params.get('tab'))) setTab(params.get('tab')!);
        }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);
    useEffect(() => {
        setData(null); setError(''); setMessage('');
        if (!selected) return;
        const controller = new AbortController();
        localStorage.setItem('growth-business', selected);
        fetch(`/api/growth?businessId=${encodeURIComponent(selected)}`, { signal: controller.signal }).then(async r => {
            const result = await r.json(); if (!r.ok) throw Error(result.error); setData(result);
        }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
        return () => controller.abort();
    }, [selected]);
    async function act(action: string, body = {}) {
        setBusy(true); setError(''); setMessage('');
        try {
            const response = await fetch('/api/growth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, businessId: selected, action }) });
            const result = await response.json();
            const refreshed = await fetch(`/api/growth?businessId=${encodeURIComponent(selected)}`);
            if (refreshed.ok) setData(await refreshed.json());
            if (!response.ok) throw Error(result.error || 'Please try again.');
            setMessage(action === 'sync' ? `${result.count} Google reviews synced${result.complete ? '.' : '; more reviews are available.'}`
                : action === 'approvePost' ? 'Post status updated. Check its delivery status below.'
                : action === 'publishReply' ? 'Reply sent to Google. Sync reviews to see Google’s latest version.' : 'Saved.');
            return result;
        } catch (e: any) { setError(e.message); throw e; }
        finally { setBusy(false); }
    }
    const panelProps = data ? { data, busy, act } : null;
    return <div className="space-y-7 growth-page">
        <header className="page-heading"><div><p className="eyebrow">A little care, consistently</p><h1>Client growth</h1><p className="page-description">Reply thoughtfully. Plan your next post. Make it easy for customers to find you.</p></div><span className="heading-icon"><Sprout size={28} /></span></header>
        <div className="surface p-5 flex flex-wrap items-center justify-between gap-4"><label className="text-sm font-medium flex flex-wrap items-center gap-3">Working on<select aria-label="Working on business" className="field min-w-0 sm:min-w-64" value={selected} disabled={busy || !businesses.length} onChange={e => { setSelected(e.target.value); chooseBusiness(e.target.value); }}>{!businesses.length && <option value="">No businesses saved</option>}{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><Link href="/businesses" className="text-sm text-blue-700 flex items-center gap-2">Manage businesses <ArrowUpRight size={15} /></Link></div>
        {error && <p role="alert" className="rounded-xl p-4 bg-red-50 text-red-800 text-sm">{error}</p>}
        {message && <p role="status" className="rounded-xl p-4 bg-green-50 text-green-800 text-sm">{message}</p>}
        {loading ? <p className="text-sm text-gray-500">Opening your workspace…</p> : !businesses.length ? <section className="surface p-10 space-y-4 text-center"><h2 className="text-xl">Start with a business.</h2><p className="text-sm text-gray-500">Add a client’s Maps link to prepare posts, QR codes, and contacts today.</p><Link href="/businesses" className="primary-button">Add a business</Link></section> : <>
            {data && <div className={`rounded-xl p-4 text-sm flex flex-wrap justify-between items-center gap-3 ${data.business.google?.connected ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}><p>{data.business.google?.connected ? 'Google linked. Sync reviews when you need the latest details.' : 'Drafts, QR codes, and contacts are ready to use. Link Google after API approval to sync and publish.'}</p><Link href="/settings/google" className="underline underline-offset-4">{data.business.google?.connected ? 'Connection settings' : 'Connect Google'}</Link></div>}
            <nav aria-label="Client growth tools" className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`secondary-button ${tab === id ? '!bg-blue-100 !border-blue-300 !text-blue-900' : ''}`}><Icon size={16} />{label}</button>)}</nav>
            {!panelProps ? <p className="text-gray-500 text-sm">{error ? 'Reopen this business to try again.' : 'Loading client work…'}</p> : <div key={selected}>{tab === 'inbox' && <ReviewInbox {...panelProps} />}{tab === 'posts' && <PostStudio {...panelProps} />}{tab === 'qr' && <ReviewStudio {...panelProps} />}{tab === 'checks' && <ProfileChecklist {...panelProps} />}{tab === 'contacts' && <Contacts {...panelProps} />}</div>}
        </>}
    </div>;
}
