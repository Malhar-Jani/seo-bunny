'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Download, CheckCircle2 } from 'lucide-react';

export function FirstSteps({ empty }: { empty: boolean }) {
    const [browser, setBrowser] = useState<{ ready: boolean; message: string } | null>(null);
    const [dismissed, setDismissed] = useState(true);
    useEffect(() => {
        setDismissed(localStorage.getItem('seo-bunny-onboarding-dismissed') === '1');
        let live = true;
        const refresh = () => fetch('/api/system/status').then(r => r.json()).then(data => { if (live) setBrowser(data.browser); }).catch(() => {});
        void refresh(); const timer = setInterval(refresh, 5000);
        const unsubscribe = (window as any).electronAPI?.onPlaywrightStatus?.((_event: unknown, status: any) => setBrowser({ ready: status.status === 'ready', message: status.message }));
        return () => { live = false; clearInterval(timer); unsubscribe?.(); };
    }, []);
    if (!empty || dismissed) return <Link href="/demo" className="text-sm text-blue-700 underline underline-offset-4">Explore a fictional business in the demo</Link>;
    return <section className="surface p-5 sm:p-7 space-y-5" aria-labelledby="first-steps-title">
        <div className="flex justify-between items-start gap-4"><div><h2 id="first-steps-title" className="text-xl font-semibold">See where a business shows up.</h2><p className="mt-2 text-sm text-gray-600 max-w-2xl">Start with a small map scan, or explore a completed example. Rank scans and the demo work without connecting a Google account.</p></div><button className="text-sm text-gray-600 underline underline-offset-4 shrink-0" onClick={() => { localStorage.setItem('seo-bunny-onboarding-dismissed', '1'); setDismissed(true); }}>Skip guide</button></div>
        <ol className="divide-y divide-gray-100 text-sm">
            <li className="py-3 flex flex-wrap justify-between gap-2"><span><strong>1. Save your business.</strong> Keep its location and reports together.</span><Link className="text-blue-700 underline underline-offset-4" href="/businesses">Add business</Link></li>
            <li className="py-3 flex flex-wrap justify-between gap-2"><span><strong>2. Check one keyword.</strong> Start with a 3 × 3 grid: nine locations.</span><Link className="text-blue-700 underline underline-offset-4" href="/scans/new">Choose your search area</Link></li>
            <li className="py-3"><strong>3. Read the heatmap.</strong> Compare coverage and retry any locations that could not be checked.</li>
        </ol>
        <p role="status" className="text-sm text-gray-600 flex gap-2 items-start">{browser?.ready ? <CheckCircle2 size={17} className="shrink-0"/> : <Download size={17} className="shrink-0"/>}{browser?.message || 'Checking the browser engine…'}</p>
        <div className="flex flex-wrap gap-3"><Link href="/demo" className="primary-button">Try the demo <ArrowRight size={16}/></Link><Link href="/settings/google" className="secondary-button">Optional: connect Google</Link></div>
    </section>;
}
