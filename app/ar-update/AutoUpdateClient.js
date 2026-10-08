'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  readQbExport, makeTypeLookup, pgsLabel, bandeyriBatches, parseBandeyriText, writeFills,
  BANDEYRI_URL, NOT_FOUND_STATUS, NON_GVT_STATUS,
} from '@/lib/arAutoFill';
import { sectorOf } from '@/lib/arEngine';
import { generateManagementSummary } from '@/lib/managementSummaryClient';

const DEFAULT_VENDOR_IDS = { PSMS: '505965' };
const SOURCE_LABELS = { bandeyri: 'Bandeyri', manual: 'Edited', file: 'In file', last: 'Last upload' };
const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function readStored(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStored(key, v) { try { localStorage.setItem(key, v); } catch { /* private mode */ } }

export default function AutoUpdateClient() {
  const [lookups, setLookups] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [file, setFile] = useState(null);           // { name, buffer }
  const [qb, setQb] = useState(null);               // readQbExport result
  const [readError, setReadError] = useState('');
  const [typeOverrides, setTypeOverrides] = useState({});   // customer → GVT/PVT/SEMI
  const [statusOverrides, setStatusOverrides] = useState({}); // invoice number → { status, source }
  const [vendorId, setVendorId] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteResult, setPasteResult] = useState('');
  const [copied, setCopied] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);     // { kind, text }
  const [summaryStatus, setSummaryStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/ar-update/lookups')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setLookups(d);
        setVendorId(readStored(`bandeyriVendor:${d.companyCode}`) || DEFAULT_VENDOR_IDS[d.companyCode] || '');
      })
      .catch((e) => setLookupError(`Could not load customer profiles: ${e.message}`));
  }, []);

  async function handleFile(f) {
    if (!f) return;
    setReadError(''); setMessage(null); setSummaryStatus('');
    setTypeOverrides({}); setStatusOverrides({}); setPasteText(''); setPasteResult('');
    try {
      const buffer = await f.arrayBuffer();
      const parsed = readQbExport(XLSX.read(buffer, { type: 'array', cellDates: true }));
      if (!parsed.invoices.length) throw new Error('No invoice or credit memo lines found in this file.');
      setFile({ name: f.name, buffer });
      setQb(parsed);
    } catch (e) {
      setFile(null); setQb(null);
      setReadError(e.message);
    }
  }

  const typeOf = useMemo(() => makeTypeLookup(lookups?.customers || []), [lookups]);

  // Work out PVT/GVT and Status for every invoice line.
  const rows = useMemo(() => {
    if (!qb || !lookups) return [];
    return qb.invoices.map((inv) => {
      const type = inv.existingPgs || typeOf(inv.customer) || typeOverrides[inv.customer] || null;
      const sector = type ? sectorOf(type) : null;
      let status = '', source = '';
      if (sector && sector !== 'GVT') {
        status = inv.existingStatus || NON_GVT_STATUS; source = inv.existingStatus ? 'file' : '';
      } else if (sector === 'GVT') {
        const o = statusOverrides[inv.number];
        if (o) { status = o.status; source = o.source; }
        else if (inv.existingStatus) { status = inv.existingStatus; source = 'file'; }
        else if (lookups.lastStatuses[inv.number]) { status = lookups.lastStatuses[inv.number]; source = 'last'; }
      }
      return { ...inv, sector, pgs: sector ? pgsLabel(sector) : '', status, source };
    });
  }, [qb, lookups, typeOf, typeOverrides, statusOverrides]);

  // Customers with no profile and nothing in the file: the user picks their sector.
  const unknownCustomers = useMemo(() => {
    const s = new Set();
    for (const inv of qb?.invoices || []) if (!inv.existingPgs && !typeOf(inv.customer)) s.add(inv.customer);
    return [...s].sort();
  }, [qb, typeOf]);
  const unpicked = unknownCustomers.filter((c) => !typeOverrides[c]);

  const gvtRows = rows.filter((r) => r.sector === 'GVT');
  const gvtNumbers = [...new Set(gvtRows.map((r) => r.number).filter(Boolean))];
  const batches = bandeyriBatches(gvtNumbers);
  const missingStatus = gvtRows.filter((r) => !r.status);
  const checkedNow = gvtRows.filter((r) => r.source === 'bandeyri' || r.source === 'manual').length;
  const ready = rows.length > 0 && !unpicked.length && !missingStatus.length;

  function setVendor(v) {
    setVendorId(v);
    if (lookups) writeStored(`bandeyriVendor:${lookups.companyCode}`, v);
  }

  async function copy(text, idx) {
    try { await navigator.clipboard.writeText(text); setCopied(idx); setTimeout(() => setCopied(-1), 1500); } catch { /* clipboard blocked */ }
  }

  function applyPaste() {
    const found = parseBandeyriText(pasteText, gvtNumbers);
    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const [n, status] of found) next[n] = { status, source: 'bandeyri' };
      return next;
    });
    setPasteResult(found.size
      ? `Read ${found.size} status${found.size === 1 ? '' : 'es'} from the pasted text.`
      : 'No statuses recognised. Copy the whole Bandeyri results area (Ctrl+A, Ctrl+C) and paste it again.');
    setPasteText('');
  }

  function markUncheckedNotFound() {
    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const r of missingStatus) if (r.number) next[r.number] = { status: NOT_FOUND_STATUS, source: 'manual' };
      return next;
    });
  }

  function buildFilledFile() {
    const wb = XLSX.read(file.buffer, { type: 'array', cellDates: true });
    writeFills(wb, qb, rows.map((r) => ({ pgs: r.pgs, status: r.status })));
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const base = file.name.replace(/\.(xlsx|xls)$/i, '');
    return new File([out], `${base} - filled.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function downloadFilled() {
    const f = buildFilledFile();
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(force) {
    setBusy(true); setMessage(null); setSummaryStatus('');
    try {
      const fd = new FormData();
      fd.append('file', buildFilledFile());
      if (force) fd.append('force', 'true');
      const res = await fetch('/api/snapshots', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.rejected) { setMessage({ kind: 'rejected', text: data.reason }); return; }
      if (!res.ok) { setMessage({ kind: 'error', text: data?.reason || `Upload failed (${res.status}).` }); return; }
      setMessage({ kind: 'success', text: `Uploaded. ${data.invoicesProcessed} invoice lines across ${data.customersFound} customers.${data.followupsLogged ? ` Balance update logged in the follow-up history for ${data.followupsLogged} customers.` : ''}` });
      setSummaryStatus('Generating management summary report…');
      setSummaryStatus(await generateManagementSummary(data.snapshot.id));
    } catch (e) {
      setMessage({ kind: 'error', text: `Upload failed: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  if (lookupError) return <p style={{ color: 'var(--amber)' }}>{lookupError}</p>;
  if (!lookups) return <p style={{ color: 'var(--ink-500)' }}>Loading…</p>;

  return (
    <div>
      <div className="card">
        <h4>1. Drop the QuickBooks export</h4>
        <p style={{ marginTop: 0, color: 'var(--ink-500)', fontSize: 13 }}>
          In QuickBooks Online: Reports → Standard → A/R Ageing Detail → Customize → add the PO Number column after Number → Run report → Export to Excel.
          Drop that file here as it is — no need to add the PVT/GVT or Status columns.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          onClick={() => !busy && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--green-700)' : 'var(--ink-100)'}`,
            background: dragging ? 'var(--green-50)' : 'transparent',
            borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: busy ? 'default' : 'pointer',
          }}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
          <p style={{ margin: 0, fontWeight: 600 }}>{file ? file.name : 'Drag & drop the QuickBooks A/R Ageing Detail export here, or click to choose a file'}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-500)' }}>.xlsx or .xls</p>
        </div>
        {readError && <p style={{ color: 'var(--amber)' }}>{readError}</p>}
        {qb && (
          <p style={{ color: 'var(--ink-500)', fontSize: 13 }}>
            {rows.length} invoice lines · {gvtRows.length} GVT · {rows.filter((r) => r.sector && r.sector !== 'GVT').length} PVT / Semi-GVT (Status set to “{NON_GVT_STATUS}”)
          </p>
        )}
      </div>

      {qb && unknownCustomers.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--amber)' }}>
          <h4>2. New customers — choose PVT/GVT</h4>
          <p style={{ marginTop: 0, color: 'var(--ink-500)', fontSize: 13 }}>
            These customers have no profile yet. Pick their sector once; it&apos;s saved to their profile when you upload.
          </p>
          {unknownCustomers.map((c) => (
            <div key={c} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ minWidth: 260 }}>{c}</span>
              <select value={typeOverrides[c] || ''} onChange={(e) => setTypeOverrides((p) => ({ ...p, [c]: e.target.value }))}>
                <option value="">Choose…</option>
                <option value="GVT">GVT</option>
                <option value="PVT">PVT</option>
                <option value="SEMI">Semi-GVT</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {qb && gvtRows.length > 0 && (
        <div className="card">
          <h4>{unknownCustomers.length ? '3' : '2'}. GVT payment status from Bandeyri</h4>
          <p style={{ marginTop: 0, color: 'var(--ink-500)', fontSize: 13 }}>
            Each GVT invoice starts with its status from the last upload. To refresh: copy a batch, search it on Bandeyri with
            the vendor ID, then select the whole results page (Ctrl+A, Ctrl+C) and paste it below. You can paste several batches at once.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <label>Vendor ID <input value={vendorId} onChange={(e) => setVendor(e.target.value)} style={{ width: 120 }} /></label>
            <button type="button" className="secondary" onClick={() => copy(vendorId, 'vendor')}>{copied === 'vendor' ? 'Copied' : 'Copy vendor ID'}</button>
            <a href={BANDEYRI_URL} target="_blank" rel="noreferrer"><button type="button">Open Bandeyri ↗</button></a>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {batches.map((b, i) => {
              const done = b.filter((n) => ['bandeyri', 'manual'].includes(statusOverrides[n]?.source)).length;
              return (
                <button key={i} type="button" className={done === b.length ? '' : 'secondary'} onClick={() => copy(b.join(','), i)}
                  title={b.join(',')} style={{ fontSize: 13 }}>
                  {copied === i ? 'Copied ✓' : `Batch ${i + 1} (${done}/${b.length})`}
                </button>
              );
            })}
          </div>

          <textarea rows={5} style={{ width: '100%', boxSizing: 'border-box' }} value={pasteText}
            onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the Bandeyri results here…" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" disabled={!pasteText.trim()} onClick={applyPaste}>Read statuses</button>
            {pasteResult && <span style={{ color: 'var(--ink-500)', fontSize: 13 }}>{pasteResult}</span>}
          </div>

          <p style={{ color: 'var(--ink-500)', fontSize: 13 }}>
            {checkedNow} of {gvtRows.length} GVT lines checked now · {gvtRows.filter((r) => r.source === 'last').length} using last upload&apos;s status · {missingStatus.length} with no status
          </p>
          {missingStatus.length > 0 && (
            <p style={{ color: 'var(--amber)', fontSize: 13 }}>
              {missingStatus.length} new GVT invoice{missingStatus.length === 1 ? ' has' : 's have'} no status yet. Check them on Bandeyri, or{' '}
              <button type="button" className="secondary" onClick={markUncheckedNotFound} style={{ fontSize: 13, minHeight: 0, padding: '4px 10px' }}>
                mark them “could not be found”
              </button>
            </p>
          )}

          <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}><table>
            <thead><tr><th>Invoice</th><th>Customer</th><th style={{ textAlign: 'right' }}>Open balance</th><th>Status</th><th>From</th></tr></thead>
            <tbody>
              {gvtRows.map((r) => (
                <tr key={r.row}>
                  <td>{r.number}</td>
                  <td>{r.customer}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.open)}</td>
                  <td style={{ minWidth: 320 }}>
                    <input value={r.status} placeholder="No status"
                      onChange={(e) => setStatusOverrides((p) => ({ ...p, [r.number]: { status: e.target.value, source: 'manual' } }))}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '5px 8px', borderColor: r.status ? undefined : 'var(--amber)' }} />
                  </td>
                  <td style={{ color: 'var(--ink-500)' }}>{SOURCE_LABELS[r.source] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {qb && (
        <div className="card">
          <h4>Upload</h4>
          {!ready && (
            <p style={{ color: 'var(--amber)', fontSize: 13 }}>
              {unpicked.length ? `Choose PVT/GVT for ${unpicked.length} new customer(s). ` : ''}
              {missingStatus.length ? `${missingStatus.length} GVT invoice(s) still need a status.` : ''}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={!ready || busy} onClick={() => upload(false)}>{busy ? 'Uploading…' : 'Fill columns & upload'}</button>
            <button type="button" className="secondary" disabled={!ready || busy} onClick={downloadFilled}>Download filled Excel</button>
          </div>
          {message?.kind === 'success' && (
            <p style={{ color: 'var(--green-700)' }}>{message.text} <Link href="/dashboard">Go to Dashboard →</Link></p>
          )}
          {message?.kind === 'error' && <p style={{ color: 'var(--amber)' }}>{message.text}</p>}
          {message?.kind === 'rejected' && (
            <div className="card" style={{ borderColor: 'var(--amber)', marginTop: 10 }}>
              <p style={{ color: 'var(--amber)' }}>{message.text}</p>
              <button className="secondary" disabled={busy} onClick={() => upload(true)}>Upload anyway (backfill history)</button>
            </div>
          )}
          {summaryStatus && <p style={{ color: 'var(--ink-500)', fontSize: 13 }}>{summaryStatus}</p>}
        </div>
      )}
    </div>
  );
}
