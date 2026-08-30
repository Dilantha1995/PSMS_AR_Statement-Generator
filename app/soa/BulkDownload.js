'use client';
import { useState } from 'react';
import JSZip from 'jszip';
import { buildCustomerPdf, buildCustomerXlsx } from '@/lib/statementBuilders';

const SECTOR_FOLDER = { GVT: 'GVT', PVT: 'PVT', SEMI: 'Semi Pvt' };
const KINDS_BY_SECTOR = { GVT: ['pending_moft', 'pending_payment', 'combined'], PVT: ['soa'], SEMI: ['soa'] };

export default function BulkDownload({ snapshotId, companyName, reportDate }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function downloadAll() {
    setBusy(true);
    setProgress('Fetching customer data…');
    try {
      const res = await fetch(`/api/snapshots/${snapshotId}/bulk`);
      if (!res.ok) throw new Error('Could not load snapshot data.');
      const { customers } = await res.json();

      const zip = new JSZip();
      let fileCount = 0;

      customers.forEach((customer, i) => {
        setProgress(`Building statements… ${i + 1}/${customers.length}`);
        const folderName = SECTOR_FOLDER[customer.sector] || 'PVT';
        const folder = zip.folder(folderName);
        const kinds = KINDS_BY_SECTOR[customer.sector] || KINDS_BY_SECTOR.PVT;

        for (const kind of kinds) {
          const pdfArgs = { companyName, reportDate, customerName: customer.name, kind, invoices: customer.invoices };
          const { doc, filename: pdfName } = buildCustomerPdf(pdfArgs);
          folder.file(`${pdfName}.pdf`, doc.output('blob'));
          fileCount++;

          const { blob, filename: xlsxName } = buildCustomerXlsx(pdfArgs);
          folder.file(`${xlsxName}.xlsx`, blob);
          fileCount++;
        }
      });

      if (!fileCount) { setProgress('No statements to package for this snapshot.'); return; }

      setProgress('Zipping…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AR_Statements_${companyName.replace(/[^a-z0-9]+/gi, '_')}_${(reportDate || '').replace(/[^a-z0-9]+/gi, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(`Done — ${fileCount} files across ${customers.length} customers.`);
    } catch (e) {
      setProgress(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <button disabled={busy} onClick={downloadAll}>{busy ? 'Building pack…' : 'Download All (ZIP — by sector)'}</button>
      {progress && <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{progress}</span>}
    </div>
  );
}
