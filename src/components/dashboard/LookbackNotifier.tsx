'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Play, X, Clock } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export function LookbackNotifier() {
    const [missedScans, setMissedScans] = useState<any[]>([]);
    const [dismissed, setDismissed] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchMissed();
    }, []);

    const fetchMissed = async () => {
        try {
            const res = await fetch('/api/system/lookback');
            const data = await res.json();
            if (data.missedScans?.length > 0) {
                setMissedScans(data.missedScans);
            }
        } catch (err) {
            console.error('Failed to check lookback:', err);
        }
    };

    const handleRunMissed = async () => {
        setLoading(true);
        try {
            await fetch('/api/system/lookback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scanIds: missedScans.map(s => s.id) }),
            });
            setMissedScans([]);
        } catch (err) {
            console.error('Failed to run missed scans:', err);
        } finally {
            setLoading(false);
        }
    };

    if (missedScans.length === 0 || dismissed) return null;

    return (
        <div className="mb-8">
            <Card className="bg-amber-50 border-amber-200 border-dashed relative overflow-hidden">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                        <Clock size={20} />
                    </div>
                    <div className="flex-1 space-y-1">
                        <h3 className="font-bold text-amber-900 flex items-center gap-2">
                            Missed Scheduled Scans
                            <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[10px] font-semibold rounded uppercase">
                                {missedScans.length} Batches
                            </span>
                        </h3>
                        <p className="text-sm text-amber-700 leading-relaxed max-w-2xl">
                            We detected {missedScans.length} report(s) that were scheduled to run while the application was offline.
                            Click below to process these missed data points now.
                        </p>
                        <div className="flex items-center gap-3 mt-4">
                            <Button
                                size="sm"
                                onClick={handleRunMissed}
                                isLoading={loading}
                                className="bg-amber-600 hover:bg-amber-700 text-white border-none shadow-sm shadow-amber-200"
                            >
                                <Play size={14} className="mr-2" />
                                Run All Missed Scans
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDismissed(true)}
                                className="bg-transparent border-amber-300 text-amber-700 hover:bg-amber-100"
                            >
                                Dismiss
                            </Button>
                        </div>
                    </div>
                    <button
                        onClick={() => setDismissed(true)}
                        className="text-amber-400 hover:text-amber-600 transition-colors p-1"
                    >
                        <X size={20} />
                    </button>
                </div>
            </Card>
        </div>
    );
}
