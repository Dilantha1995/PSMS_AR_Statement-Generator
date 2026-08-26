import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET(req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [customer] = await sql`select * from customers where id=${params.id} and company_id=${company.id}`;
  if (!customer) return new Response('Not found', { status: 404 });

  const [snapshot] = await sql`select * from ar_snapshots where company_id=${company.id} order by report_date_parsed desc nulls last, uploaded_at desc limit 1`;
  if (!snapshot) return Response.json({ customer, snapshot: null, invoices: [] });

  const invoices = await sql`
    select * from ar_invoices where snapshot_id=${snapshot.id} and customer_id=${params.id} order by txn_date
  `;
  return Response.json({ customer, company, snapshot, invoices });
}
