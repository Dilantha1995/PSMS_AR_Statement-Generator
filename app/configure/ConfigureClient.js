'use client';
import { useState, useEffect, useRef } from 'react';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Renders page 1 of a PDF to a PNG (base64), auto-cropped to just the header content
 * region (logo/title block), trimming the blank body and any footer graphic — so a
 * letterhead can be uploaded as its full original page and still produce a clean, usable
 * header banner instead of the whole page being shrunk into an unreadable sliver. */
async function pdfFirstPageToPngBase64(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 2.5; // render at higher resolution than the page's native size for a crisp result
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Scan rows from the top, looking only within the top ~40% of the page (the header always
  // lives there; a footer graphic further down is deliberately out of range and gets excluded).
  // Find the last row that still has visible (non-white) content, then crop right after it.
  const { width, height } = canvas;
  const searchLimit = Math.floor(height * 0.4);
  const imgData = ctx.getImageData(0, 0, width, searchLimit).data;
  const WHITE_THRESHOLD = 248;
  let lastContentRow = 0;
  for (let y = 0; y < searchLimit; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 3) { // sample every 3rd pixel — plenty for detecting content, much faster
      const i = rowStart + x * 4;
      if (imgData[i + 3] > 10 && (imgData[i] < WHITE_THRESHOLD || imgData[i + 1] < WHITE_THRESHOLD || imgData[i + 2] < WHITE_THRESHOLD)) {
        lastContentRow = y;
        break;
      }
    }
  }
  const padding = Math.round(height * 0.015);
  // If nothing detected (e.g. a near-blank top), fall back to a sensible default header height.
  const cropHeight = lastContentRow > 10 ? Math.min(searchLimit, lastContentRow + padding) : Math.round(height * 0.16);

  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = cropHeight;
  cropped.getContext('2d').drawImage(canvas, 0, 0, width, cropHeight, 0, 0, width, cropHeight);

  return new Promise((resolve) => {
    cropped.toBlob((blob) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

export default function ConfigurePage() {
  const [branding, setBranding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [prefix, setPrefix] = useState('');
  const logoRef = useRef(null);
  const letterheadRef = useRef(null);

  useEffect(() => {
    fetch('/api/company/branding').then((r) => r.json()).then((d) => {
      setBranding(d);
      setPrefix(d.report_prefix || `${d.code}/ACC/AR`);
      setLoading(false);
    });
  }, []);

  async function uploadImage(kind, file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setStatus({ kind: 'error', text: 'Please use a file under 8MB.' }); return; }

    let base64, mime;
    if (file.type === 'application/pdf') {
      if (kind === 'logo') { setStatus({ kind: 'error', text: 'Logo must be a PNG or JPG image, not a PDF.' }); return; }
      setStatus({ kind: 'info', text: 'Converting PDF letterhead to an image (using page 1)…' });
      try {
        base64 = await pdfFirstPageToPngBase64(file);
        mime = 'image/png';
      } catch (e) {
        setStatus({ kind: 'error', text: `Could not read that PDF: ${e.message}` });
        return;
      }
    } else if (file.type.startsWith('image/')) {
      base64 = await fileToBase64(file);
      mime = file.type;
    } else {
      setStatus({ kind: 'error', text: `That's a ${file.type || 'unrecognized'} file. Please upload a PNG, JPG, or PDF.` });
      return;
    }

    setStatus({ kind: 'info', text: `Uploading ${kind}…` });
    const body = kind === 'logo'
      ? { logo_base64: base64, logo_mime: mime }
      : { letterhead_base64: base64, letterhead_mime: mime };
    const res = await fetch('/api/company/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      const updated = await fetch('/api/company/branding').then((r) => r.json());
      setBranding(updated);
      setStatus({ kind: 'success', text: `${kind === 'logo' ? 'Logo' : 'Letterhead'} updated.` });
    } else {
      setStatus({ kind: 'error', text: 'Upload failed.' });
    }
  }

  async function savePrefix() {
    setStatus({ kind: 'info', text: 'Saving…' });
    const res = await fetch('/api/company/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_prefix: prefix }) });
    setStatus(res.ok ? { kind: 'success', text: 'Reference number prefix saved.' } : { kind: 'error', text: 'Save failed.' });
  }

  if (loading) return <div><h2>Configure</h2><p>Loading…</p></div>;

  const nextYear = new Date().getFullYear();

  return (
    <div>
      <h2>Configure — {branding.name}</h2>
      <p style={{ color: 'var(--ink-500)' }}>Company branding and document numbering for reports generated by AR Suite.</p>

      {status && <p style={{ color: status.kind === 'error' ? 'var(--amber)' : status.kind === 'success' ? 'var(--green-700)' : 'var(--ink-500)' }}>{status.text}</p>}

      <div className="card">
        <h4>Company Logo</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>Used as a small mark on reports. PNG or JPG, ideally square, under 8MB.</p>
        {branding.logo_base64 && (
          <img src={`data:${branding.logo_mime};base64,${branding.logo_base64}`} alt="Company logo" style={{ maxHeight: 80, marginBottom: 10, display: 'block' }} />
        )}
        <input ref={logoRef} type="file" accept="image/png,image/jpeg" onChange={(e) => uploadImage('logo', e.target.files[0])} />
      </div>

      <div className="card">
        <h4>Company Letterhead</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          Your official letterhead, used at the top of the Management Summary Report. Upload it as a <strong>PDF</strong> (page 1
          is converted to an image automatically) or as a PNG/JPG image directly. Landscape orientation works best, under 8MB.
        </p>
        {branding.letterhead_base64 && (
          <img src={`data:${branding.letterhead_mime};base64,${branding.letterhead_base64}`} alt="Company letterhead" style={{ maxWidth: '100%', maxHeight: 160, marginBottom: 10, display: 'block', border: '1px solid var(--ink-100)' }} />
        )}
        <input ref={letterheadRef} type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => uploadImage('letterhead', e.target.files[0])} />
      </div>

      <div className="card">
        <h4>Report Reference Number</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          Every Management Summary Report gets a unique reference number: <code>{prefix || `${branding.code}/ACC/AR`}/{nextYear}/001</code>, incrementing per year.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={`${branding.code}/ACC/AR`} style={{ width: 260 }} />
          <button onClick={savePrefix}>Save</button>
        </div>
      </div>
    </div>
  );
}
