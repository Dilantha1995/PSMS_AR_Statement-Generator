'use client';
import { useState } from 'react';
import { buildCustomerPdf, buildCustomerXlsx } from '@/lib/statementBuilders';

const KINDS_GVT = [
  ['pending_moft', 'Pending Submit to MOFT'],
  ['pending_payment', 'Pending Payment from MOFT'],
  ['combined', 'Combined SOA'],
];
const KINDS_OTHER = [['soa', 'SOA']];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function GenerateButtons({ customerId, customerName, isGvt, companyName, reportDate, snapshotId }) {
  const [busy, setBusy] = useState(false);

  async function generate(kind, format) {
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/invoices`);
      const { invoices } = await res.json();
      const args = { companyName, reportDate, customerName, kind, invoices };
      let filename, base64;
      if (format === 'pdf') {
        const built = buildCustomerPdf(args);
        built.doc.save(`${built.filename}.pdf`);
        filename = `${built.filename}.pdf`;
        base64 = built.doc.output('datauristring').split(',')[1];
      } else {
        const built = buildCustomerXlsx(args);
        const url = URL.createObjectURL(built.blob);
        const a = document.createElement('a'); a.href = url; a.download = `${built.filename}.xlsx`; a.click(); URL.revokeObjectURL(url);
        filename = `${built.filename}.xlsx`;
        base64 = await blobToBase64(built.blob);
      }
      await fetch('/api/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, snapshot_id: snapshotId, kind, format, filename, file_base64: base64 }),
      });
    } finally { setBusy(false); }
  }

  const kinds = isGvt ? KINDS_GVT : KINDS_OTHER;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {kinds.map(([kind, label]) => (
        <span key={kind} style={{ display: 'inline-flex', gap: 4 }}>
          <button disabled={busy} onClick={() => generate(kind, 'pdf')} title={label}>{label} · PDF</button>
          <button disabled={busy} className="secondary" onClick={() => generate(kind, 'xlsx')} title={label}>Excel</button>
        </span>
      ))}
    </div>
  );
}
