import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function POST(req, { params }) {
  const { error } = await requireUserAndCompany();
  if (error) return error;
  const b = await req.json();

  if (b.is_primary) {
    await sql`update customer_contacts set is_primary = false where customer_id = ${params.id}`;
  }
  const [row] = await sql`
    insert into customer_contacts (customer_id, contact_name, role, phone, email, is_primary)
    values (${params.id}, ${b.contact_name || null}, ${b.role || null}, ${b.phone || null}, ${b.email || null}, ${!!b.is_primary})
    returning *
  `;
  return Response.json(row);
}
