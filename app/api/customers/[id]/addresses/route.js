import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function POST(req, { params }) {
  const { error } = await requireUserAndCompany();
  if (error) return error;
  const b = await req.json();

  if (b.is_primary) {
    await sql`update customer_addresses set is_primary = false where customer_id = ${params.id}`;
  }
  const [row] = await sql`
    insert into customer_addresses (customer_id, label, address_line, island, atoll, is_primary)
    values (${params.id}, ${b.label || null}, ${b.address_line || null}, ${b.island || null}, ${b.atoll || null}, ${!!b.is_primary})
    returning *
  `;
  return Response.json(row);
}
