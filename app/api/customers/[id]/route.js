import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [customer] = await sql`
    select * from customers where id = ${params.id} and company_id = ${company.id}
  `;
  if (!customer) return new Response('Not found', { status: 404 });

  const [contacts, addresses, followups] = await Promise.all([
    sql`select * from customer_contacts where customer_id = ${params.id} order by is_primary desc, created_at`,
    sql`select * from customer_addresses where customer_id = ${params.id} order by is_primary desc, created_at`,
    sql`select f.*, u.full_name as logged_by_name
        from followups f left join app_users u on u.id = f.logged_by
        where f.customer_id = ${params.id}
        order by f.followup_date desc, f.created_at desc
        limit 20`,
  ]);

  return Response.json({ customer, contacts, addresses, followups });
}

export async function PATCH(req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;
  const body = await req.json();

  const [row] = await sql`
    update customers set
      name = coalesce(${body.name}, name),
      type = coalesce(${body.type}, type),
      status = coalesce(${body.status}, status),
      notes = coalesce(${body.notes}, notes),
      updated_at = now()
    where id = ${params.id} and company_id = ${company.id}
    returning *
  `;
  if (!row) return new Response('Not found', { status: 404 });
  return Response.json(row);
}
