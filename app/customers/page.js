import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

async function addCustomer(formData) {
  'use server';
  const company = await getCurrentCompany();
  await sql`
    insert into customers (company_id, name, type)
    values (${company.id}, ${formData.get('name')}, ${formData.get('type')})
    on conflict (company_id, name) do nothing
  `;
  revalidatePath('/customers');
}

export default async function CustomersPage({ searchParams }) {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const search = searchParams?.search || '';
  const customers = await sql`
    select c.*,
      coalesce((select sum(open_balance) from ar_invoices i
        where i.customer_id = c.id
          and i.snapshot_id = (select id from ar_snapshots s where s.company_id = c.company_id order by s.report_date_parsed desc nulls last, s.uploaded_at desc limit 1)
      ), 0) as latest_open_balance
    from customers c
    where c.company_id = ${company.id}
      and (${search} = '' or c.name ilike ${'%' + search + '%'})
    order by c.name
  `;

  return (
    <div>
      <h2>Customers — {company.name}</h2>

      <form method="get" className="card" style={{ display: 'flex', gap: 8 }}>
        <input name="search" placeholder="Search customer…" defaultValue={search} />
        <button type="submit">Search</button>
      </form>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>+ Add a customer manually</summary>
        <form action={addCustomer} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input name="name" placeholder="Customer name" required />
          <select name="type" defaultValue="PVT">
            <option value="GVT">GVT</option>
            <option value="PVT">PVT</option>
            <option value="SEMI">Semi-GVT</option>
          </select>
          <button type="submit">Add</button>
        </form>
      </details>

      <div className="table-scroll"><table>
        <thead><tr><th>Customer</th><th>Type</th><th style={{ textAlign: 'right' }}>Latest Open Balance</th><th></th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td><span className={`badge ${c.type}`}>{c.type}</span></td>
              <td style={{ textAlign: 'right' }}>{Number(c.latest_open_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td><Link href={`/customers/${c.id}`}>Open →</Link></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
