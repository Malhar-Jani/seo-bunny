'use client';
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
export function BackupControls() {
    const file = useRef<HTMLInputElement>(null);
    const [message,setMessage] = useState('');
    const [busy,setBusy] = useState(false);
    async function restore(selected?: File) {
        if (!selected || !confirm('Replace this workspace with the selected backup? A recovery copy of your current data will be saved first. Stop all scans and review jobs before continuing.')) return;
        setBusy(true); setMessage('');
        try {
            const response = await fetch('/api/system/backup', { method:'POST', headers:{'Content-Type':'application/json'}, body:await selected.text() });
            const result=await response.json();
            if(!response.ok) throw new Error(result.error);
            setMessage(`Restored. Your previous data is saved in .local-backups/${result.recoveryBackup}. Refresh the page to load restored settings.`);
        } catch(e:any) {setMessage(e.message)} finally {setBusy(false);if(file.current)file.current.value=''}
    }
    return <section className="surface p-6 space-y-4"><div><h2 className="font-semibold">Keep a copy of your work</h2><p className="text-sm text-gray-600 mt-2">Keep a private copy of your workspace, or export a rank report for sharing.</p><details className="text-sm text-gray-600 mt-3"><summary>What’s included?</summary><p className="mt-2 max-w-3xl leading-relaxed">Private backups include contacts, notes, reviews, settings and proxy credentials. Google credentials and temporary Google data are excluded. Shareable rank reports exclude private fields, but still contain business names and locations. After restoring a private backup, link your Google businesses again.</p></details></div><div className="flex flex-wrap gap-3"><a className="secondary-button" href="/api/system/backup" download><Download size={15}/>Download private backup</a><a className="secondary-button" href="/api/reports/export" download>Export shareable rank report</a><button className="secondary-button" disabled={busy} onClick={()=>file.current?.click()}><Upload size={15}/>{busy?'Restoring…':'Restore backup'}</button><input ref={file} className="hidden" type="file" accept="application/json,.json" aria-label="Select backup file" onChange={e=>restore(e.target.files?.[0])}/></div>{message&&<p role="status" className="text-sm text-gray-700 break-words">{message}</p>}</section>;
}
