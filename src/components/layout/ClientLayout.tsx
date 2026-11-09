'use client';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BusinessProvider } from './BusinessContext';
import { WorkspaceBar } from './WorkspaceBar';
export function ClientLayout({ children }: { children: ReactNode }) {
    return <BusinessProvider><div className="min-h-screen"><Sidebar />
        <main className="app-main lg:ml-60 min-h-screen px-4 sm:px-7 lg:px-10 pt-28 lg:pt-10 pb-6">
            <div className="mx-auto max-w-[1560px] min-w-0"><WorkspaceBar />{children}</div>
            <footer className="mt-16 py-7 text-center text-xs text-gray-500 border-t border-gray-200/70"><span className="font-semibold text-gray-800">SEO Bunny</span> · Designed &amp; built by <span className="font-semibold text-gray-800">Mal</span> <span aria-label="with love">❤️</span></footer>
        </main></div></BusinessProvider>;
}
