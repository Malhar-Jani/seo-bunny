'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
type Run = { runId: string; runAt: string; resultCount: number };
export function TimelineBar({runs,activeRunId,onSelectRun}:{runs:Run[];activeRunId:string|null;onSelectRun:(id:string)=>void}) {
    if (runs.length <= 1) return null;
    const index = Math.max(0, runs.findIndex(r => r.runId === activeRunId));
    return <div className="run-picker"><label className="flex items-center gap-3 text-sm text-gray-600">Viewing run<select aria-label="Report run" className="field" value={runs[index].runId} onChange={e=>onSelectRun(e.target.value)}>{runs.map((r,i)=><option key={r.runId} value={r.runId}>{new Date(r.runAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}{i===runs.length-1?' · Latest':''}</option>)}</select></label><div className="flex items-center gap-2"><span className="text-xs text-gray-600">{index+1} of {runs.length}</span><button className="secondary-button" aria-label="Previous run" disabled={index===0} onClick={()=>onSelectRun(runs[index-1].runId)}><ChevronLeft size={15}/></button><button className="secondary-button" aria-label="Next run" disabled={index===runs.length-1} onClick={()=>onSelectRun(runs[index+1].runId)}><ChevronRight size={15}/></button></div></div>;
}
