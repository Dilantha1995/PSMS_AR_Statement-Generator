import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function FollowupReportPage({ searchParams }) {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const from = searchParams?.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams?.to || new Date().toISOString().slice(0, 10);
  const customerId = searchParams?.customer_id || '';

  const [customers, rows] = await Promise.all([
    sql`select id, name from customers where company_id=${company.id} order by name`,
    sql`
      select f.*, c.name as customer_name, c.type as customer_type, u.full_name as logged_by_name
      from followups f
      join customers c on c.id = f.customer_id
      left join app_users u on u.id = f.logged_by
      where f.company_id = ${company.id}
        and f.followup_date between ${from} and ${to}
        and (${customerId} = '' or f.customer_id = ${customerId})
      order by f.followup_date desc, c.name
    `,
  ]);

  const totalDiscussed = rows.reduce((s, r) => s + Number(r.amount_discussed || 0), 0);

  return (
    <div>
      <h2>Follow-up Report — {company.name}</h2>

      <form method="get" className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label>From <input type="date" name="from" defaultValue={from} /></label>
        <label>To <input type="date" name="to" defaultValue={to} /></label>
        <label>Customer
          <select name="customer_id" defaultValue={customerId}>
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="submit">Run report</button>
      </form>

      <p style={{ color: 'var(--ink-500)' }}>{rows.length} follow-up{rows.length === 1 ? '' : 's'} · {totalDiscussed.toLocaleString(undefined, { minimumFractionDigits: 2 })} discussed in total</p>

      <table>
        <thead><tr><th>Date</th><th>Customer</th><th>Outcome</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th>Next action</th><th>By</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.followup_date}</td>
              <td>{r.customer_name} <span className={`badge ${r.customer_type}`}>{r.customer_type}</span></td>
              <td>{r.outcome}{r.promised_date ? ` (${r.promised_date})` : ''}</td>
              <td>{r.note}</td>
              <td style={{ textAlign: 'right' }}>{r.amount_discussed ? Number(r.amount_discussed).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
              <td>{r.next_action_date || '—'}</td>
              <td>{r.logged_by_name || '—'}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7}>No follow-ups in this period.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
