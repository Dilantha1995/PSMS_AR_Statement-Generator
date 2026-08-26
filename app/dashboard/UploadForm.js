'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'error'|'rejected'|'success', text }
  const [pendingFile, setPendingFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
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
      setFileName('');
      setMessage({ kind: 'success', text: `Saved. ${data.invoicesProcessed} invoice lines across ${data.customersFound} customers.` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;
    setFileName(file.name);
    doUpload(file, false);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !busy && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--green-700)' : 'var(--ink-100)'}`,
          background: dragging ? 'var(--green-50)' : 'transparent',
          borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: busy ? 'default' : 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input
          ref={fileInputRef} type="file" accept=".xlsx,.xls" disabled={busy} style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p style={{ margin: 0, fontWeight: 600 }}>{busy ? 'Uploading…' : fileName || 'Drag & drop the A/R Ageing report here, or click to choose a file'}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-500)' }}>.xlsx or .xls</p>
      </div>
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
