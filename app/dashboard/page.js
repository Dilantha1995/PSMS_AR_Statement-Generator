import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import UploadForm from './UploadForm';
import PaymentsEntry from './PaymentsEntry';
import DashboardExport from './DashboardExport';
import { buildDashboardAnalysis } from '@/lib/analysis';

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;

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
    order by s.report_date_parsed desc nulls last, s.uploaded_at desc
    limit 15
  `;

  let analysis = null, customers = [];
  if (snapshots.length) {
    const latest = snapshots[0];
    analysis = await buildDashboardAnalysis(company.id, latest.id);
    customers = await sql`select id, name from customers where company_id = ${company.id} order by name`;
  }

  return (
    <div>
      <h2>Dashboard — {company.name}</h2>

      <div className="card">
        <h4>Upload a new A/R Ageing Detail Report</h4>
        <UploadForm />
      </div>

      {analysis && (
        <>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h4 style={{ margin: 0 }}>A/R Analysis — GVT vs PVT vs Semi-GVT</h4>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-500)', fontSize: 13 }}>As of: {snapshots[0].report_date || snapshots[0].uploaded_at?.slice(0, 10)}</p>
            </div>
            <DashboardExport companyName={company.name} reportDate={snapshots[0].report_date} analysis={analysis} snapshotId={snapshots[0].id} />
          </div>

          <div className="card">
            <h4>Sector Summary</h4>
            <table>
              <thead><tr><th>Sector</th><th style={{ textAlign: 'right' }}>Total Outstanding - QB</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Paid &amp; Details Pending</th><th style={{ textAlign: 'right' }}>Net Outstanding</th></tr></thead>
              <tbody>
                <tr><td><span className="badge GVT">GVT</span></td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.gvt.qb)}</td><td style={{ textAlign: 'right' }}>{pct(analysis.sectors.gvt.pct)}</td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.gvt.paid)}</td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.gvt.net)}</td></tr>
                <tr><td><span className="badge PVT">PVT</span></td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.pvt.qb)}</td><td style={{ textAlign: 'right' }}>{pct(analysis.sectors.pvt.pct)}</td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.pvt.paid)}</td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.pvt.net)}</td></tr>
                <tr><td><span className="badge SEMI">Semi-GVT</span></td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.semi.qb)}</td><td style={{ textAlign: 'right' }}>{pct(analysis.sectors.semi.pct)}</td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.semi.paid)}</td><td style={{ textAlign: 'right' }}>{fmt(analysis.sectors.semi.net)}</td></tr>
                <tr className="total-row"><td><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{fmt(analysis.sectors.total.qb)}</strong></td><td></td><td style={{ textAlign: 'right' }}><strong>{fmt(analysis.sectors.total.paid)}</strong></td><td style={{ textAlign: 'right' }}><strong>{fmt(analysis.sectors.total.net)}</strong></td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>GVT — Customer-wise MOFT Analysis</h4>
            <table>
              <thead><tr><th>#</th><th>Customer</th><th style={{ textAlign: 'right' }}>Not Submitted to MOFT</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Payment Pending from MOFT</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Paid &amp; Pending</th><th style={{ textAlign: 'right' }}>Total Outstanding</th></tr></thead>
              <tbody>
                {analysis.gvtCustomers.map((c, i) => (
                  <tr key={c.name}>
                    <td>{i + 1}</td><td>{c.name}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.submit)}</td><td style={{ textAlign: 'right' }}>{pct(c.submitPct)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.pay)}</td><td style={{ textAlign: 'right' }}>{pct(c.payPct)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(c.paid)}</td><td style={{ textAlign: 'right' }}>{fmt(c.gross)}</td>
                  </tr>
                ))}
                <tr className="total-row"><td></td><td><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.gvtCustomers.reduce((s, x) => s + x.submit, 0))}</strong></td><td></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.gvtCustomers.reduce((s, x) => s + x.pay, 0))}</strong></td><td></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.gvtCustomers.reduce((s, x) => s + x.paid, 0))}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.gvtCustomers.reduce((s, x) => s + x.gross, 0))}</strong></td>
                </tr>
                {!analysis.gvtCustomers.length && <tr><td colSpan={8}>No GVT customers in this report.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>PVT — Customer-wise Analysis</h4>
            <table>
              <thead><tr><th>#</th><th>Customer</th><th style={{ textAlign: 'right' }}>Outstanding - QB</th><th style={{ textAlign: 'right' }}>Paid &amp; Pending</th><th style={{ textAlign: 'right' }}>Net Outstanding</th></tr></thead>
              <tbody>
                {analysis.pvtCustomers.map((c, i) => (
                  <tr key={c.name}><td>{i + 1}</td><td>{c.name}</td><td style={{ textAlign: 'right' }}>{fmt(c.qb)}</td><td style={{ textAlign: 'right' }}>{fmt(c.paid)}</td><td style={{ textAlign: 'right' }}>{fmt(c.net)}</td></tr>
                ))}
                <tr className="total-row"><td></td><td><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.pvtCustomers.reduce((s, x) => s + x.qb, 0))}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.pvtCustomers.reduce((s, x) => s + x.paid, 0))}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.pvtCustomers.reduce((s, x) => s + x.net, 0))}</strong></td>
                </tr>
                {!analysis.pvtCustomers.length && <tr><td colSpan={5}>No PVT customers in this report.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h4>Semi-GVT — Customer-wise Analysis</h4>
            <table>
              <thead><tr><th>#</th><th>Customer</th><th style={{ textAlign: 'right' }}>Outstanding - QB</th><th style={{ textAlign: 'right' }}>Paid &amp; Pending</th><th style={{ textAlign: 'right' }}>Net Outstanding</th></tr></thead>
              <tbody>
                {analysis.semiCustomers.map((c, i) => (
                  <tr key={c.name}><td>{i + 1}</td><td>{c.name}</td><td style={{ textAlign: 'right' }}>{fmt(c.qb)}</td><td style={{ textAlign: 'right' }}>{fmt(c.paid)}</td><td style={{ textAlign: 'right' }}>{fmt(c.net)}</td></tr>
                ))}
                <tr className="total-row"><td></td><td><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.semiCustomers.reduce((s, x) => s + x.qb, 0))}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.semiCustomers.reduce((s, x) => s + x.paid, 0))}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmt(analysis.semiCustomers.reduce((s, x) => s + x.net, 0))}</strong></td>
                </tr>
                {!analysis.semiCustomers.length && <tr><td colSpan={5}>No Semi-GVT customers in this report.</td></tr>}
              </tbody>
            </table>
          </div>

          <PaymentsEntry snapshotId={snapshots[0].id} customers={customers} />
        </>
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
                <td style={{ textAlign: 'right' }}>{fmt(s.total_open)}</td>
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
