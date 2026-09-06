'use client';
import { useState, useRef } from 'react';
import { buildDashboardPdf, buildDashboardXlsx } from '@/lib/dashboardBuilders';
import { buildManagementSummaryPdf } from '@/lib/managementSummaryPdf';

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
  const [masterBusy, setMasterBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const summaryInFlight = useRef(false);

  async function saveDocument(filename, format, base64, kind = 'dashboard') {
    await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, format, filename, file_base64: base64, snapshot_id: snapshotId }),
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

  async function exportMasterAnalysis() {
    setMasterBusy(true);
    try {
      const res = await fetch(`/api/snapshots/${snapshotId}/master-analysis`);
      if (!res.ok) throw new Error('Failed to generate Master Analysis workbook.');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'AR_Analysis.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
      const base64 = await blobToBase64(blob);
      await saveDocument(filename, 'xlsx', base64);
    } catch (e) {
      alert(e.message);
    } finally { setMasterBusy(false); }
  }

  async function exportManagementSummary() {
    if (summaryInFlight.current) return; // guards against a rapid double-click firing before the button visually disables
    summaryInFlight.current = true;
    setSummaryBusy(true);
    try {
      // Always regenerate with the current branding/letterhead and current payment/ageing
      // data — the reference number is tied to the snapshot (not the generation event), so
      // this never issues a new number, and the saved history entry is updated in place.
      const res = await fetch(`/api/snapshots/${snapshotId}/management-summary`);
      if (!res.ok) throw new Error('Failed to generate Management Summary Report.');
      const data = await res.json();
      const { doc, filename } = await buildManagementSummaryPdf(data);
      doc.save(`${filename}.pdf`);
      const base64 = doc.output('datauristring').split(',')[1];
      await saveDocument(`${filename}.pdf`, 'pdf', base64, 'management_summary');
    } catch (e) {
      alert(e.message);
    } finally {
      setSummaryBusy(false);
      summaryInFlight.current = false;
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button disabled={busy} onClick={exportPdf}>Download Dashboard PDF</button>
      <button disabled={busy} className="secondary" onClick={exportXlsx}>Download Dashboard Excel</button>
      <button disabled={masterBusy} className="secondary" onClick={exportMasterAnalysis}>{masterBusy ? 'Building…' : 'Download Master Analysis Excel'}</button>
      <button disabled={summaryBusy} className="secondary" onClick={exportManagementSummary}>{summaryBusy ? 'Generating…' : 'Management Summary Report'}</button>
    </div>
  );
}
