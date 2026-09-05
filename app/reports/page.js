import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import DashboardExport from '../dashboard/DashboardExport';
import SectorPieChart from '../dashboard/SectorPieChart';
import BulkDownload from '../soa/BulkDownload';
import { buildDashboardAnalysis } from '@/lib/analysis';

export default async function ReportsPage() {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const [snapshot] = await sql`
    select * from ar_snapshots where company_id = ${company.id}
    order by report_date_parsed desc nulls last, uploaded_at desc limit 1
  `;

  if (!snapshot) {
    return (
      <div>
        <h2>Reports — {company.name}</h2>
        <p>No A/R report uploaded yet for {company.name}. Upload one from the Dashboard first — every report type below becomes available once there's a snapshot to report on.</p>
      </div>
    );
  }

  const analysis = await buildDashboardAnalysis(company.id, snapshot.id);

  return (
    <div>
      <h2>Reports — {company.name}</h2>
      <p style={{ color: 'var(--ink-500)' }}>Based on the latest report: {snapshot.report_date || snapshot.uploaded_at?.slice(0, 10)}</p>

      <div className="card">
        <h4>Dashboard &amp; Analysis Reports</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          Sector breakdown as PDF/Excel, the full multi-sheet Master Analysis workbook (GVT/PVT/Semi-GVT notes + ageing data),
          and the AI-supported Management Summary Report with critical overdue invoices.
        </p>
        <DashboardExport companyName={company.name} reportDate={snapshot.report_date} analysis={analysis} snapshotId={snapshot.id} />
      </div>

      <div className="card">
        <h4>Sector Breakdown — Pie Chart</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>A visual GVT / PVT / Semi-GVT split, downloadable as a PNG image.</p>
        <SectorPieChart sectors={analysis.sectors} />
      </div>

      <div className="card">
        <h4>Customer Statement Pack (ZIP)</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>
          Every customer's SOA / MOFT statements, packaged into GVT / PVT / Semi Pvt folders, plus the Dashboard and Master Analysis reports at the root.
        </p>
        <BulkDownload snapshotId={snapshot.id} companyName={company.name} reportDate={snapshot.report_date} />
      </div>

      <div className="card">
        <h4>Individual Customer Statements</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>Generate a single customer's SOA / MOFT statement one at a time.</p>
        <Link href="/soa">Open SOA Generator →</Link>
      </div>

      <div className="card">
        <h4>Follow-up Report</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>Every logged follow-up call/visit for a date range, across one or all customers.</p>
        <Link href="/followups/report">Open Follow-up Report →</Link>
      </div>

      <div className="card">
        <h4>All Generated Documents</h4>
        <p style={{ fontSize: 13, color: 'var(--ink-500)' }}>Every report and statement ever generated for {company.name} stays here, downloadable again anytime.</p>
        <Link href="/documents">Open Documents Library →</Link>
      </div>
    </div>
  );
}
