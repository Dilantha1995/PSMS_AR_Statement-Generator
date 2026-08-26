'use client';
import { useState } from 'react';
import { buildDashboardPdf, buildDashboardXlsx } from '@/lib/dashboardBuilders';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function DashboardExport({ companyName, reportDate, analysis, snapshotId }) {
  const [busy, setBusy] = useState(false);

  async function saveDocument(filename, format, base64) {
    await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'dashboard', format, filename, file_base64: base64, snapshot_id: snapshotId }),
    });
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const { doc, filename } = buildDashboardPdf({ companyName, reportDate, analysis });
      doc.save(`${filename}.pdf`);
      const base64 = doc.output('datauristring').split(',')[1];
      await saveDocument(`${filename}.pdf`, 'pdf', base64);
    } finally { setBusy(false); }
  }

  async function exportXlsx() {
    setBusy(true);
    try {
      const { blob, filename } = buildDashboardXlsx({ companyName, reportDate, analysis });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${filename}.xlsx`; a.click(); URL.revokeObjectURL(url);
      const base64 = await blobToBase64(blob);
      await saveDocument(`${filename}.xlsx`, 'xlsx', base64);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button disabled={busy} onClick={exportPdf}>Download Dashboard PDF</button>
      <button disabled={busy} className="secondary" onClick={exportXlsx}>Download Dashboard Excel</button>
    </div>
  );
}
