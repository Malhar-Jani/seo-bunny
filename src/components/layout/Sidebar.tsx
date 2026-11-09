'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, MapPin, MessageSquareText, Wrench, CalendarDays, BarChart3, Settings2, Menu, X, Sprout, Rabbit, CircleHelp } from 'lucide-react';
import { useBusiness } from './BusinessContext';
const items = [['/', 'Overview', LayoutDashboard], ['/businesses', 'Businesses', Building2], ['/scans', 'Rank tracker', MapPin], ['/reviews', 'Reviews', MessageSquareText], ['/reports', 'Reports', BarChart3], ['/settings', 'Settings', Settings2]] as const;
export function Sidebar() {
    const path = usePathname(), { href: scoped } = useBusiness(); const [open, setOpen] = useState(false);
    function entry(href: string, label: string, Icon: any, secondary = false) {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return <Link key={href} href={scoped(href)} prefetch={false} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)} className={`nav-entry ${secondary ? 'nav-secondary' : ''} ${active ? 'nav-active' : ''}`}><Icon size={secondary ? 15 : 18} strokeWidth={1.7}/>{label}</Link>;
    }
    const nav = <nav aria-label="Main navigation" className="space-y-1">{items.map(([href, label, Icon]) => <div key={href}>{entry(href,label,Icon)}{href === '/businesses' && entry('/growth','Client growth',Sprout,true)}{href === '/scans' && entry('/schedules','Schedules',CalendarDays,true)}</div>)}</nav>;
    const utility = <nav aria-label="Resources" className="space-y-1">{entry('/tools','SEO tools',Wrench,true)}{entry('/demo','Try the demo',Rabbit,true)}{entry('/help','Help',CircleHelp,true)}</nav>;
    const brand = <Link href={scoped('/')} className="flex items-center gap-3" onClick={() => setOpen(false)}><span className="brand-mark"><Rabbit size={23} strokeWidth={1.7}/></span><span className="text-lg font-semibold text-gray-900">SEO Bunny<span className="block text-xs font-normal text-gray-600 mt-0.5">Local SEO workspace</span></span></Link>;
    return <><aside className="sidebar-bg hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col px-4 py-7 z-40">{brand}<div className="mt-9">{nav}</div><div className="mt-auto pt-6">{utility}<p className="mt-5 px-3 text-xs text-gray-600">Runs on your computer · By Mal</p></div></aside><header className="lg:hidden fixed top-0 inset-x-0 z-50 border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">{brand}<button className="p-2 rounded-lg hover:bg-gray-100" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button></header>{open && <div className="lg:hidden fixed inset-0 top-[74px] z-40 bg-black/20" onClick={() => setOpen(false)}><div className="mobile-navigation bg-white border-b border-gray-200 p-4" onClick={e => e.stopPropagation()}>{nav}<div className="border-t border-gray-200 mt-3 pt-3">{utility}</div></div></div>}</>;
}
