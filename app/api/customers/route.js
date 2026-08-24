import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET(req) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type'); // 'GVT' | 'PVT' | 'SEMI' | null

  const rows = await sql`
    select c.*,
      (select row_to_json(a) from customer_addresses a
        where a.customer_id = c.id order by a.is_primary desc limit 1) as primary_address,
      (select row_to_json(k) from customer_contacts k
        where k.customer_id = c.id order by k.is_primary desc limit 1) as primary_contact,
      coalesce((select sum(open_balance) from ar_invoices i
        where i.customer_id = c.id
          and i.snapshot_id = (select id from ar_snapshots s
                                where s.company_id = c.company_id
                                order by s.uploaded_at desc limit 1)), 0) as latest_open_balance
    from customers c
    where c.company_id = ${company.id}
      and (${search} = '' or c.name ilike ${'%' + search + '%'})
      and (${type}::text is null or c.type = ${type})
    order by c.name
  `;
  return Response.json(rows);
}

export async function POST(req) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;
  const body = await req.json();
  if (!body.name) return new Response('name is required', { status: 400 });

  const rows = await sql`
    insert into customers (company_id, name, type, status, notes)
    values (${company.id}, ${body.name}, ${body.type || 'PVT'}, ${body.status || 'active'}, ${body.notes || null})
    on conflict (company_id, name) do update set
      type = excluded.type, status = excluded.status, notes = excluded.notes, updated_at = now()
    returning *
  `;
  return Response.json(rows[0]);
}
