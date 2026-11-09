'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
type Business = { id: string; name: string; address?: string; lat?: number; lng?: number };
const Context = createContext({ businessId: '', businesses: [] as Business[], ready: false, chooseBusiness: (_id: string) => {}, href: (path: string) => path });
export const useBusiness = () => useContext(Context);
export function BusinessProvider({ children }: { children: ReactNode }) {
    const path = usePathname(), router = useRouter();
    const [businessId, setBusinessId] = useState(''), [businesses, setBusinesses] = useState<Business[]>([]), [ready, setReady] = useState(false);
    useEffect(() => {
        if (path === '/demo') { setReady(true); return; }
        let live = true;
        const detail = /^\/(scans|reviews)\/(?!new$)[^/]+$/.test(path);
        Promise.all([
            fetch('/api/businesses').then(r => r.ok ? r.json() : Promise.reject()),
            detail ? fetch('/api' + path + '?meta=1').then(r => r.ok ? r.json() : {}) : Promise.resolve({}),
        ]).then(([data, record]) => {
            if (!live) return;
            const rows: Business[] = data.businesses || []; setBusinesses(rows);
            const query = new URLSearchParams(location.search);
            const saved = detail && 'businessId' in record ? (typeof record.businessId === 'string' ? record.businessId : '') : query.has('businessId') ? query.get('businessId') || '' : localStorage.getItem('seo-bunny-business') || '';
            if (detail && 'businessId' in record) localStorage.setItem('seo-bunny-business', saved);
            setBusinessId(rows.some(b => b.id === saved) ? saved : ''); setReady(true);
        }).catch(() => { if (live) setReady(true); });
        return () => { live = false; };
    }, [path]);
    function chooseBusiness(id: string) {
        setBusinessId(id); localStorage.setItem('seo-bunny-business', id);
        const query = new URLSearchParams(location.search);
        if (id) query.set('businessId', id); else query.delete('businessId');
        router.replace(path + (query.size ? '?' + query.toString() : ''));
    }
    function href(target: string) {
        if (!businessId || target === '/demo' || target.startsWith('/settings')) return target;
        const [base, search = ''] = target.split('?'); const query = new URLSearchParams(search); query.set('businessId', businessId);
        return base + '?' + query.toString();
    }
    return <Context.Provider value={{ businessId, businesses, ready, chooseBusiness, href }}>{children}</Context.Provider>;
}

