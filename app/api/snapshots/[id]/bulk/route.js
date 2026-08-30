import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';
import { sectorOf } from '@/lib/arEngine';

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [snapshot] = await sql`select * from ar_snapshots where id = ${params.id} and company_id = ${company.id}`;
  if (!snapshot) return new Response('Not found', { status: 404 });

  const invoices = await sql`
    select i.*, c.type as customer_type
    from ar_invoices i
    left join customers c on c.id = i.customer_id
    where i.snapshot_id = ${params.id}
    order by i.customer_name_raw, i.txn_date
  `;

  const byCustomer = new Map();
  for (const inv of invoices) {
    const key = inv.customer_id || inv.customer_name_raw;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { id: inv.customer_id, name: inv.customer_name_raw, sector: sectorOf(inv.customer_type || inv.pgs_raw), invoices: [] });
    }
    byCustomer.get(key).invoices.push(inv);
  }

  return Response.json({ snapshot, customers: Array.from(byCustomer.values()) });
}
