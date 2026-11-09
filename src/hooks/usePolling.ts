'use client';
import { useEffect, useRef } from 'react';

/** No overlapping requests, no polling in hidden tabs, fast only during active work. */
export function usePolling(load: () => Promise<unknown>, interval: number) {
    const latest = useRef(load);
    latest.current = load;
    useEffect(() => {
        let stopped = false;
        let busy = false;
        let timer: ReturnType<typeof setTimeout>;
        const tick = async () => {
            clearTimeout(timer);
            if (busy || stopped) return;
            if (document.visibilityState === 'visible') {
                busy = true;
                try { await latest.current(); } catch { /* caller owns error state */ }
                finally { busy = false; }
            }
            if (!stopped && interval > 0) timer = setTimeout(tick, interval);
        };
        const visible = () => { if (document.visibilityState === 'visible') void tick(); };
        void tick();
        document.addEventListener('visibilitychange', visible);
        return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
    }, [interval]);
}
