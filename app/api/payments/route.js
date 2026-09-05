import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET(req) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  // Payments are a running ledger per company/customer — they are NOT scoped to a
  // single snapshot, so they carry forward automatically to every new report upload
  // until someone removes them (fully settled) or adds a new one.
  const rows = await sql`
    select p.*, c.name as customer_name, u.full_name as entered_by_name
    from payments p
    left join customers c on c.id = p.customer_id
    left join app_users u on u.id = p.entered_by
    where p.company_id = ${company.id}
    order by p.created_at desc
  `;
  return Response.json(rows);
}

export async function POST(req) {
  const { error, user, company } = await requireUserAndCompany();
  if (error) return error;
  const b = await req.json();
  if (!b.customer_id) return new Response('customer_id is required', { status: 400 });
  if (!b.amount) return new Response('amount is required', { status: 400 });

  // snapshot_id is kept only as provenance (which report was current when this was entered) —
  // it is never used to filter, so the payment is visible against every future report too.
  const [row] = await sql`
    insert into payments (company_id, snapshot_id, customer_id, pay_date, reference, amount, entered_by)
    values (${company.id}, ${b.snapshot_id || null}, ${b.customer_id}, ${b.pay_date || new Date().toISOString().slice(0, 10)}, ${b.reference || null}, ${b.amount}, ${user.id})
    returning *
  `;
  return Response.json(row);
}

export async function DELETE(req) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('id is required', { status: 400 });
  await sql`delete from payments where id = ${id} and company_id = ${company.id}`;
  return Response.json({ ok: true });
}
