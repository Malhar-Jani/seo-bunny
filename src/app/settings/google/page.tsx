'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Building2, Check, Copy, ExternalLink, Link2, RefreshCw, Unplug } from 'lucide-react';

type Status = { configured: boolean; clientId: string; redirectUri: string; connection: { email: string; connectedAt: string } | null };
type Account = { name: string; title: string; type?: string; role?: string };
type Business = { locationName: string; title: string; importedBusinessId: string | null; profile: { address?: string; category?: string } };
const results: Record<string, string> = {
    ACCESS_DENIED: 'Google access was cancelled. Connect again when you are ready.',
    INVALID_STATE: 'The sign-in request expired or was opened in another browser. Please start again here.',
    CONFIG_CHANGED: 'The Google client settings changed during sign-in. Start a new connection.',
    TOKEN_EXCHANGE: 'Google could not finish sign-in. Check the client secret and exact callback address below.',
    MISSING_SCOPE: 'Business Profile access was not granted. Connect again and allow that permission.',
    MISSING_TOKEN: 'Google did not return a lasting connection. Connect again and approve access.',
    INVALID_IDENTITY: 'Google account verification failed. Please connect again.',
    MISSING_CODE: 'Google did not return a connection code. Please try again.',
    KEY_UNAVAILABLE: 'The saved Google credentials could not be unlocked. Save your client details again.',
};
async function request(url: string, body?: unknown) {
    const response = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not complete this request. Try again.');
    return data;
}
function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline underline-offset-4">{children}<ExternalLink size={12} className="shrink-0" /></a>;
}
export default function GoogleSettingsPage() {
    const [status, setStatus] = useState<Status | null>(null);
    const [clientId, setClientId] = useState('');
    const [secret, setSecret] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [account, setAccount] = useState('');
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [loadedLocations, setLoadedLocations] = useState(false);
    const [selected, setSelected] = useState<Record<string, string>>({});
    async function loadStatus() {
        const data = await request('/api/gbp/config'); setStatus(data); setClientId(data.clientId);
    }
    useEffect(() => {
        const result = new URLSearchParams(window.location.search).get('result');
        if (result) {
            if (result === 'connected') setMessage('Google account connected. Load your accounts below to choose a business.');
            else setError(results[result] || 'The connection could not be completed. Please try again.');
            window.history.replaceState(null, '', window.location.pathname);
        }
        loadStatus().catch(e => setError(e.message));
    }, []);
    useEffect(() => {
        if (error || message) document.getElementById('google-feedback')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [error, message]);
    async function act(name: string, work: () => Promise<void>) {
        setBusy(name); setError(''); setMessage('');
        try { await work(); } catch (e: any) { setError(e.message); } finally { setBusy(''); }
    }
    async function save(e: React.FormEvent) {
        e.preventDefault();
        await act('save', async () => {
            await request('/api/gbp/config', { clientId: clientId.trim(), clientSecret: secret }); setSecret('');
            setAccounts([]); setAccount(''); setBusinesses([]); setSelected({}); setLoadedLocations(false);
            await loadStatus(); setMessage('Client details saved on this laptop. You can connect your manager account now.');
        });
    }
    async function loadBusinesses() {
        await act('locations', async () => {
            setBusinesses([]); setSelected({}); setLoadedLocations(false);
            const data = await request(`/api/gbp/locations?account=${encodeURIComponent(account)}`);
            setBusinesses(data.businesses); setLoadedLocations(true);
        });
    }
    const count = Object.keys(selected).length;
    return <div className="max-w-4xl mx-auto space-y-7 pb-8">
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-gray-600"><ArrowLeft size={15} />Settings</Link>
        <header className="page-heading"><div><p className="eyebrow">Your client businesses</p><h1>Connect Google Business Profile</h1><p className="page-description">Use the Google account where you are an owner or manager. Rank scans, review analysis, and the demo work without this connection. Official profile imports, review sync, replies, and posts require your own approved Google Cloud project.</p></div></header>
        {(error || message) && <div id="google-feedback" role={error ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm break-words ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>{error || message}</div>}
        {!status && !error && <p className="text-gray-500" role="status">Checking the connection…</p>}
        {status && <>
            <section className="surface p-6 sm:p-7 space-y-5">
                <div className="flex flex-wrap gap-4 items-start justify-between"><div><h2 className="font-semibold flex items-center gap-2"><Link2 size={18} />{status.connection ? 'Google account connected' : 'Connect your manager account'}</h2><p className="text-sm text-gray-600 mt-2 break-all">{status.connection?.email || (status.configured ? 'Your client details are saved. The next step is Google sign-in.' : 'Complete the one-time Google setup below to get started.')}</p></div><span className="status-pill">{status.connection ? 'Connected' : status.configured ? 'Ready for sign-in' : 'Setup needed'}</span></div>
                <p className="text-sm text-gray-500 leading-relaxed">Google’s Business Profile permission allows management of your profiles. This app uses it to read business details and reviews, and to publish replies or posts you explicitly approve in Client growth. It also requests your email to show which account is connected.</p>
                <div className="flex flex-wrap gap-3"><button className="primary-button" disabled={!!busy || !status.configured} onClick={() => act('connect', async () => { const data = await request('/api/gbp/connect', {}); window.location.assign(data.url); })}><Link2 size={15} />{busy === 'connect' ? 'Opening Google…' : status.connection ? 'Reconnect / change account' : 'Connect with Google'}</button>
                {status.connection && <button className="secondary-button" disabled={!!busy} onClick={() => act('disconnect', async () => { await request('/api/gbp/disconnect', {}); await loadStatus(); setAccounts([]); setBusinesses([]); setAccount(''); setSelected({}); setLoadedLocations(false); setMessage('Disconnected on this laptop. Your saved workspace names and notes are kept.'); })}><Unplug size={15} />Disconnect</button>}</div>
                {status.connection && <p className="text-xs text-gray-500">You can also remove this app’s access in <OutLink href="https://myaccount.google.com/connections">your Google account</OutLink>.</p>}
            </section>
            {status.connection && <section className="surface p-6 sm:p-7 space-y-5">
                <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-semibold flex gap-2 items-center"><Building2 size={18} />Choose your businesses</h2><p className="text-sm text-gray-500 mt-2">Choose an account or location group, then select the businesses you want here.</p></div><button className="secondary-button" disabled={!!busy} onClick={() => act('accounts', async () => { setAccounts([]); setAccount(''); setBusinesses([]); setSelected({}); setLoadedLocations(false); const data = await request('/api/gbp/accounts'); setAccounts(data.accounts); if (data.accounts.length) setAccount(data.accounts[0].name); else setMessage('Google returned no Business Profile accounts. Check that this email has accepted its manager invitation.'); })}><RefreshCw size={14} />{busy === 'accounts' ? 'Loading…' : 'Load Google accounts'}</button></div>
                {!!accounts.length && <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"><label className="text-sm flex-1 min-w-0">Google account or location group<select className="field w-full mt-2" disabled={!!busy} value={account} onChange={e => { setAccount(e.target.value); setBusinesses([]); setSelected({}); setLoadedLocations(false); }}>{accounts.map(a => <option key={a.name} value={a.name}>{a.title}{a.type ? ` (${a.type.toLowerCase().replaceAll('_', ' ')})` : ''}</option>)}</select></label><button className="secondary-button" disabled={!!busy || !account} onClick={loadBusinesses}>{busy === 'locations' ? 'Loading…' : 'Load businesses'}</button></div>}
                {loadedLocations && !businesses.length && <p className="text-sm text-gray-500">No businesses were returned for this account. Try another location group or check your manager access.</p>}
                {!!businesses.length && <><p className="text-xs text-gray-500">Choose a workspace name for each business. Existing linked businesses will have their Google details refreshed; your notes and manual details stay as entered.</p><div className="divide-y divide-gray-200">{businesses.map(b => <div key={b.locationName} className="py-4 space-y-3"><label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" className="mt-1 accent-[#c25430]" disabled={!!busy} checked={Object.hasOwn(selected, b.locationName)} onChange={e => setSelected(old => { const next = { ...old }; if (e.target.checked) next[b.locationName] = b.title; else delete next[b.locationName]; return next; })} /><span className="min-w-0"><span className="font-medium text-sm block">{b.title}</span><span className="text-sm text-gray-500 block mt-1">{b.profile.address || b.profile.category || 'No public address'}</span>{b.importedBusinessId && <span className="text-xs text-blue-700 inline-flex gap-1 items-center mt-2"><Check size={12} />Already in your workspace</span>}</span></label>{Object.hasOwn(selected, b.locationName) && !b.importedBusinessId && <label className="block text-xs text-gray-600 sm:ml-7">Workspace name<input aria-label={`Workspace name for ${b.title}`} className="field w-full mt-1" maxLength={200} value={selected[b.locationName]} onChange={e => setSelected({ ...selected, [b.locationName]: e.target.value })} /></label>}</div>)}</div><div className="flex flex-wrap items-center gap-4"><button className="primary-button" disabled={!!busy || !count || Object.values(selected).some(v => !v.trim())} onClick={() => act('import', async () => { const result = await request('/api/gbp/import', { accountName: account, selected: Object.entries(selected).map(([locationName, label]) => ({ locationName, label })) }); setSelected({}); const data = await request(`/api/gbp/locations?account=${encodeURIComponent(account)}`); setBusinesses(data.businesses); setMessage(`${result.created} added, ${result.linked} linked to existing businesses, ${result.refreshed} refreshed.`); })}>{busy === 'import' ? 'Saving businesses…' : `Import / refresh selected${count ? ` (${count})` : ''}`}</button><Link href="/businesses" className="inline-flex items-center gap-1 text-sm text-blue-700">Open businesses<ArrowUpRight size={14} /></Link></div><p className="text-xs text-gray-500">Google details are kept for up to 30 days. Refresh them here when needed. Your chosen workspace names and notes are retained.</p></>}
            </section>}
            <details className="surface p-6 sm:p-7" open={!status.configured}>
                <summary className="font-semibold cursor-pointer">One-time Google setup {status.configured && '· Client details saved'}</summary>
                <div className="mt-6 space-y-7 text-sm text-gray-600 leading-relaxed">
                    <section className="space-y-3"><h3 className="font-semibold text-gray-900">1. Create your Google Cloud project</h3><p>Sign in with your own manager email. A client’s profile is fine; you do not need to sign in as the client. Name your project something you recognise, such as SEO Bunny.</p><OutLink href="https://console.cloud.google.com/projectcreate">Create a project</OutLink></section>
                    <section className="space-y-3"><h3 className="font-semibold text-gray-900">2. Request Business Profile API access</h3><p>Apply using an email listed as an owner or manager. Google requires a verified profile active for at least 60 days, and a website representing that business. Keep your project number handy for the application.</p><p><OutLink href="https://developers.google.com/my-business/content/prereqs">Google’s requirements and access application</OutLink></p><p>After approval, follow <OutLink href="https://developers.google.com/my-business/content/basic-setup">Google’s API setup instructions</OutLink>. The business picker here uses <strong>My Business Account Management API</strong> and <strong>My Business Business Information API</strong>. Reviews, replies, and posts also use the Google My Business API. Sign-in alone does not confirm API approval. A quota of 0 means the project is still unapproved.</p></section>
                    <section className="space-y-3"><h3 className="font-semibold text-gray-900">3. Set up Google Auth Platform</h3><p>In your Cloud project, open Google Auth Platform. Set the app name to SEO Bunny and choose your support email. For a regular Gmail account, choose External audience. While testing, add your manager email as a test user.</p><p>Under Data Access, include <code className="text-xs break-all">https://www.googleapis.com/auth/business.manage</code>, plus <code>openid</code> and <code>email</code>. Create an OAuth client of type <strong>Web application</strong>, then add this exact <strong>Authorised redirect URI</strong>:</p><div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-3"><code className="text-xs break-all flex-1 text-gray-800">{status.redirectUri}</code><button type="button" className="shrink-0 p-1" aria-label="Copy callback address" onClick={() => navigator.clipboard.writeText(status.redirectUri).then(() => setMessage('Callback address copied.')).catch(() => setError('Select and copy the callback address manually.'))}><Copy size={16} /></button></div><p className="text-xs">Copy the client ID and client secret when Google shows them. Paste them only into the fields below.</p><OutLink href="https://console.cloud.google.com/auth/overview">Open Google Auth Platform</OutLink><p className="text-xs">In Google’s Testing mode, this connection normally needs sign-in again after 7 days. For ongoing use, review Google’s production and verification requirements. API access approval and OAuth app verification are separate steps. <OutLink href="https://developers.google.com/identity/protocols/oauth2/production-readiness/overview">Google’s app status guide</OutLink></p></section>
                    <section className="space-y-3"><h3 className="font-semibold text-gray-900">4. Save your client details</h3><form onSubmit={save} className="space-y-4"><label className="block">OAuth client ID<input className="field w-full mt-2" autoComplete="off" required value={clientId} onChange={e => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" /></label><label className="block">Client secret<input className="field w-full mt-2" type="password" autoComplete="new-password" required={!status.configured || status.clientId !== clientId.trim()} value={secret} onChange={e => setSecret(e.target.value)} placeholder={status.configured ? 'Saved. Leave blank to keep it.' : 'Paste your client secret here'} /></label><p className="text-xs">Saved encrypted on this laptop. Secrets and Google access tokens are excluded from workspace backups.{status.connection && ' Saving new credentials disconnects the current account.'}</p><button className="secondary-button" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save client details'}</button></form></section>
                </div>
            </details>
        </>}
    </div>;
}
