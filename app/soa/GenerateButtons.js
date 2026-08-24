'use client';
import { useState } from 'react';
import { buildCustomerPdf, buildCustomerXlsx } from '@/lib/statementBuilders';

const KINDS_GVT = [
  ['pending_moft', 'Pending Submit to MOFT'],
  ['pending_payment', 'Pending Payment from MOFT'],
  ['combined', 'Combined SOA'],
];
const KINDS_OTHER = [['soa', 'SOA']];

export default function GenerateButtons({ customerId, customerName, isGvt, companyName, reportDate, snapshotId }) {
  const [busy, setBusy] = useState(false);

  async function generate(kind, format) {
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/invoices`);
      const { invoices } = await res.json();
      const args = { companyName, reportDate, customerName, kind, invoices };
      if (format === 'pdf') {
        const { doc, filename } = buildCustomerPdf(args);
        doc.save(`${filename}.pdf`);
      } else {
        const { blob, filename } = buildCustomerXlsx(args);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${filename}.xlsx`; a.click(); URL.revokeObjectURL(url);
      }
      await fetch('/api/statements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, snapshot_id: snapshotId, kind, format }),
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
