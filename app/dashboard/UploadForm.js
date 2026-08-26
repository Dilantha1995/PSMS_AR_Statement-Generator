'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'error'|'rejected'|'success', text }
  const [pendingFile, setPendingFile] = useState(null);
  const router = useRouter();

  async function doUpload(file, force) {
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (force) fd.append('force', 'true');
      const res = await fetch('/api/snapshots', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);

      if (res.status === 409 && data?.rejected) {
        setPendingFile(file);
        setMessage({ kind: 'rejected', text: data.reason });
        return;
      }
      if (!res.ok) {
        setMessage({ kind: 'error', text: data?.reason || `Upload failed (${res.status}).` });
        return;
      }
      setPendingFile(null);
      setMessage({ kind: 'success', text: `Saved. ${data.invoicesProcessed} invoice lines across ${data.customersFound} customers.` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); const file = e.target.file.files[0]; if (file) doUpload(file, false); }} style={{ display: 'flex', gap: 8 }}>
        <input type="file" name="file" accept=".xlsx,.xls" required disabled={busy} />
        <button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload & Parse'}</button>
      </form>
      <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>Every upload is kept as history below — a report older than the one already on file is refused so it can't roll balances backward.</p>

      {message?.kind === 'success' && <p style={{ color: 'var(--green-700)' }}>{message.text}</p>}
      {message?.kind === 'error' && <p style={{ color: 'var(--amber)' }}>{message.text}</p>}
      {message?.kind === 'rejected' && (
        <div className="card" style={{ borderColor: 'var(--amber)' }}>
          <p style={{ color: 'var(--amber)' }}>{message.text}</p>
          <button className="secondary" disabled={busy} onClick={() => pendingFile && doUpload(pendingFile, true)}>
            Upload anyway (backfill history)
          </button>
        </div>
      )}
    </div>
  );
}
