'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronRight } from 'lucide-react';
import { useBusiness } from './BusinessContext';
export function WorkspaceBar() {
    const { businessId, businesses, chooseBusiness, ready } = useBusiness(); const path = usePathname();
    const report = /^\/(scans|reviews)\/(?!new$)[^/]+$/.test(path);
    if (path === '/demo') return <div className="workspace-bar"><span>Demo workspace</span><span className="text-xs text-gray-600">Fictional data · changes aren’t saved</span></div>;
    return <div className="workspace-bar"><label className="flex items-center gap-2 min-w-0"><Building2 size={16} className="shrink-0 text-gray-500"/><span className="sr-only">Active business</span><select aria-label="Active business" title={report ? 'This report belongs to the business shown here.' : 'Choose a business for your workspace'} value={businessId} disabled={!ready || report} onChange={e => chooseBusiness(e.target.value)} className="business-picker"><option value="">{report ? 'Unassigned business' : 'All businesses'}</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><Link href="/businesses" className="flex items-center gap-1 text-xs text-gray-600">Manage businesses <ChevronRight size={13}/></Link></div>;
}
