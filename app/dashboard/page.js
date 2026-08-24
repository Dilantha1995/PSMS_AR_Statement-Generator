import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sectorOf } from '@/lib/arEngine';

export default async function DashboardPage() {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const snapshots = await sql`
    select s.*, u.full_name as uploaded_by_name,
      (select count(*) from ar_invoices i where i.snapshot_id = s.id) as invoice_count,
      (select coalesce(sum(open_balance),0) from ar_invoices i where i.snapshot_id = s.id) as total_open
    from ar_snapshots s
    left join app_users u on u.id = s.uploaded_by
    where s.company_id = ${company.id}
    order by s.uploaded_at desc
    limit 15
  `;

  let sectorSummary = null;
  if (snapshots.length) {
    const latest = snapshots[0];
    const invoices = await sql`
      select customer_name_raw, pgs_raw, open_balance from ar_invoices where snapshot_id = ${latest.id}
    `;
    const byCustomerType = await sql`
      select c.type, i.customer_name_raw, i.open_balance
      from ar_invoices i left join customers c on c.id = i.customer_id
      where i.snapshot_id = ${latest.id}
    `;
    const totals = { GVT: 0, PVT: 0, SEMI: 0 };
    for (const r of byCustomerType) totals[sectorOf(r.type || r.pgs_raw)] += Number(r.open_balance);
    const grand = totals.GVT + totals.PVT + totals.SEMI || 1;
    sectorSummary = { latest, totals, grand, invoiceCount: invoices.length };
  }

  return (
    <div>
      <h2>Dashboard — {company.name}</h2>

      <div className="card">
        <h4>Upload a new A/R Ageing Detail Report</h4>
        <form action="/api/snapshots" method="post" encType="multipart/form-data" style={{ display: 'flex', gap: 8 }}>
          <input type="file" name="file" accept=".xlsx,.xls" required />
          <button type="submit">Upload &amp; Parse</button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>Every upload is kept as history below — nothing is overwritten.</p>
      </div>

      {sectorSummary && (
        <div className="card">
          <h4>Latest snapshot — {sectorSummary.latest.report_date || sectorSummary.latest.uploaded_at?.slice(0,10)}</h4>
          <table>
            <thead><tr><th>Sector</th><th style={{ textAlign: 'right' }}>Outstanding</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
            <tbody>
              <tr><td><span className="badge GVT">GVT</span></td><td style={{ textAlign: 'right' }}>{sectorSummary.totals.GVT.toLocaleString(undefined,{minimumFractionDigits:2})}</td><td style={{ textAlign: 'right' }}>{(sectorSummary.totals.GVT/sectorSummary.grand*100).toFixed(1)}%</td></tr>
              <tr><td><span className="badge PVT">PVT</span></td><td style={{ textAlign: 'right' }}>{sectorSummary.totals.PVT.toLocaleString(undefined,{minimumFractionDigits:2})}</td><td style={{ textAlign: 'right' }}>{(sectorSummary.totals.PVT/sectorSummary.grand*100).toFixed(1)}%</td></tr>
              <tr><td><span className="badge SEMI">Semi-GVT</span></td><td style={{ textAlign: 'right' }}>{sectorSummary.totals.SEMI.toLocaleString(undefined,{minimumFractionDigits:2})}</td><td style={{ textAlign: 'right' }}>{(sectorSummary.totals.SEMI/sectorSummary.grand*100).toFixed(1)}%</td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h4>Upload history</h4>
        <table>
          <thead><tr><th>Uploaded</th><th>Report date</th><th>File</th><th>Invoices</th><th style={{ textAlign: 'right' }}>Total open</th><th>By</th></tr></thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.uploaded_at).toLocaleString()}</td>
                <td>{s.report_date || '—'}</td>
                <td>{s.source_filename}</td>
                <td>{s.invoice_count}</td>
                <td style={{ textAlign: 'right' }}>{Number(s.total_open).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                <td>{s.uploaded_by_name || '—'}</td>
              </tr>
            ))}
            {!snapshots.length && <tr><td colSpan={6}>No uploads yet — upload your first A/R ageing report above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
