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

function canvasToBase64(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

/** Renders page 1 of a PDF to a canvas and auto-crops both a header strip (top content
 * block, e.g. logo/title) and a footer strip (bottom content block, e.g. address/wave
 * graphic), trimming the blank body between them — so a full letterhead page can be
 * uploaded as-is and still produce clean, usable header + footer banners. */
async function pdfPageToHeaderFooterPng(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 2.5;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  const { width, height } = canvas;
  const WHITE_THRESHOLD = 248;
  const hasContent = (imgData, rowIndex, rowWidth) => {
    const rowStart = rowIndex * rowWidth * 4;
    for (let x = 0; x < rowWidth; x += 3) {
      const i = rowStart + x * 4;
      if (imgData[i + 3] > 10 && (imgData[i] < WHITE_THRESHOLD || imgData[i + 1] < WHITE_THRESHOLD || imgData[i + 2] < WHITE_THRESHOLD)) return true;
    }
    return false;
  };

  // --- Header: scan down from the top, only within the top 40% ---
  const headerLimit = Math.floor(height * 0.4);
  const headerData = ctx.getImageData(0, 0, width, headerLimit).data;
  let lastHeaderRow = 0;
  for (let y = 0; y < headerLimit; y++) if (hasContent(headerData, y, width)) lastHeaderRow = y;
  const headerPad = Math.round(height * 0.015);
  const headerHeight = lastHeaderRow > 10 ? Math.min(headerLimit, lastHeaderRow + headerPad) : Math.round(height * 0.16);

  const headerCanvas = document.createElement('canvas');
  headerCanvas.width = width; headerCanvas.height = headerHeight;
  headerCanvas.getContext('2d').drawImage(canvas, 0, 0, width, headerHeight, 0, 0, width, headerHeight);

  // --- Footer: scan up from the bottom, only within the bottom 40% ---
  const footerZoneStart = Math.floor(height * 0.6);
  const footerZoneHeight = height - footerZoneStart;
  const footerData = ctx.getImageData(0, footerZoneStart, width, footerZoneHeight).data;
  let firstFooterRow = footerZoneHeight; // relative to footerZoneStart; stays at max if nothing found
  for (let y = 0; y < footerZoneHeight; y++) if (hasContent(footerData, y, width)) { firstFooterRow = y; break; }
  const footerPad = Math.round(height * 0.01);
  let footer = null;
  if (firstFooterRow < footerZoneHeight) {
    const footerTop = footerZoneStart + Math.max(0, firstFooterRow - footerPad);
    const footerHeight = height - footerTop;
    const footerCanvas = document.createElement('canvas');
    footerCanvas.width = width; footerCanvas.height = footerHeight;
    footerCanvas.getContext('2d').drawImage(canvas, 0, footerTop, width, footerHeight, 0, 0, width, footerHeight);
    footer = await canvasToBase64(footerCanvas);
  }

  const header = await canvasToBase64(headerCanvas);
  return { header, footer };
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

  async function uploadLogo(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus({ kind: 'error', text: 'Logo must be a PNG or JPG image, not a PDF.' }); return; }
    if (file.size > 8 * 1024 * 1024) { setStatus({ kind: 'error', text: 'Please use a file under 8MB.' }); return; }
    setStatus({ kind: 'info', text: 'Uploading logo…' });
    const base64 = await fileToBase64(file);
    const res = await fetch('/api/company/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo_base64: base64, logo_mime: file.type }) });
    if (res.ok) {
      setBranding(await fetch('/api/company/branding').then((r) => r.json()));
      setStatus({ kind: 'success', text: 'Logo updated.' });
    } else setStatus({ kind: 'error', text: 'Upload failed.' });
  }

  async function uploadLetterhead(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setStatus({ kind: 'error', text: 'Please use a file under 8MB.' }); return; }

    let headerBase64, footerBase64, mime = 'image/png';
    if (file.type === 'application/pdf') {
      setStatus({ kind: 'info', text: 'Converting PDF letterhead (extracting header + footer)…' });
      try {
        const { header, footer } = await pdfPageToHeaderFooterPng(file);
        headerBase64 = header; footerBase64 = footer;
      } catch (e) {
        setStatus({ kind: 'error', text: `Could not read that PDF: ${e.message}` });
        return;
      }
    } else if (file.type.startsWith('image/')) {
      headerBase64 = await fileToBase64(file);
      mime = file.type;
      footerBase64 = undefined; // an image upload only sets the header banner; footer stays whatever it was
    } else {
      setStatus({ kind: 'error', text: `That's a ${file.type || 'unrecognized'} file. Please upload a PNG, JPG, or PDF.` });
      return;
    }

    setStatus({ kind: 'info', text: 'Uploading letterhead…' });
    const body = { letterhead_base64: headerBase64, letterhead_mime: mime };
    if (footerBase64 !== undefined) { body.letterhead_footer_base64 = footerBase64; body.letterhead_footer_mime = footerBase64 ? 'image/png' : null; }
    const res = await fetch('/api/company/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      setBranding(await fetch('/api/company/branding').then((r) => r.json()));
      setStatus({ kind: 'success', text: `Letterhead updated${footerBase64 ? ' (header + footer detected)' : footerBase64 === null ? ' (no separate footer graphic detected)' : ''}.` });
    } else {
      const msg = await res.text();
      setStatus({ kind: 'error', text: msg || 'Upload failed.' });
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
        <input ref={logoRef} type="file" accept="image/png,image/jpeg" onChange={(e) => uploadLogo(e.target.files[0])} />
      </div>

      <div className="card">
        <h4>Company Letterhead</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          Your official letterhead, used at the top and bottom of the Management Summary Report. Upload it as a <strong>PDF</strong> —
          the header block and footer block are detected and cropped automatically — or as a PNG/JPG image directly (header only). Under 8MB.
        </p>
        {branding.letterhead_base64 && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 4px' }}>Header</p>
            <img src={`data:${branding.letterhead_mime};base64,${branding.letterhead_base64}`} alt="Letterhead header" style={{ maxWidth: '100%', maxHeight: 100, display: 'block', border: '1px solid var(--ink-100)' }} />
          </div>
        )}
        {branding.letterhead_footer_base64 && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 4px' }}>Footer</p>
            <img src={`data:${branding.letterhead_footer_mime};base64,${branding.letterhead_footer_base64}`} alt="Letterhead footer" style={{ maxWidth: '100%', maxHeight: 100, display: 'block', border: '1px solid var(--ink-100)' }} />
          </div>
        )}
        <input ref={letterheadRef} type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => uploadLetterhead(e.target.files[0])} />
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
