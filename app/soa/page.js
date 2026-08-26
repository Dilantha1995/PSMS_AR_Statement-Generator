import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sectorOf } from '@/lib/arEngine';
import GenerateButtons from './GenerateButtons';

export default async function SoaPage() {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const [snapshot] = await sql`select * from ar_snapshots where company_id=${company.id} order by report_date_parsed desc nulls last, uploaded_at desc limit 1`;
  if (!snapshot) {
    return <div><h2>SOA Generator</h2><p>No A/R report uploaded yet for {company.name}. Upload one from the Dashboard first.</p></div>;
  }

  const customers = await sql`
    select c.id, c.name, c.type, coalesce(sum(i.open_balance),0) as open_balance,
      count(*) filter (where i.status_class='pending_moft') as pending_moft_count,
      count(*) filter (where i.status_class='pending_payment') as pending_payment_count
    from ar_invoices i
    join customers c on c.id = i.customer_id
    where i.snapshot_id = ${snapshot.id}
    group by c.id, c.name, c.type
    order by c.name
  `;

  return (
    <div>
      <h2>SOA Generator — {company.name}</h2>
      <p style={{ color: 'var(--ink-500)' }}>Snapshot: {snapshot.report_date || snapshot.uploaded_at?.slice(0,10)} · {customers.length} customers</p>
      <div className="table-scroll"><table>
        <thead><tr><th>Customer</th><th>Type</th><th style={{ textAlign: 'right' }}>Open Balance</th><th>Statements</th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td><span className={`badge ${sectorOf(c.type)}`}>{sectorOf(c.type)}</span></td>
              <td style={{ textAlign: 'right' }}>{Number(c.open_balance).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
              <td>
                <GenerateButtons
                  customerId={c.id}
                  customerName={c.name}
                  isGvt={sectorOf(c.type) === 'GVT'}
                  companyName={company.name}
                  reportDate={snapshot.report_date}
                  snapshotId={snapshot.id}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
