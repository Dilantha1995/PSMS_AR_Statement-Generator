import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function POST(req) {
  const { error, user, company } = await requireUserAndCompany();
  if (error) return error;
  const b = await req.json();
  await sql`
    insert into statement_log (company_id, customer_id, snapshot_id, kind, format, generated_by)
    values (${company.id}, ${b.customer_id}, ${b.snapshot_id || null}, ${b.kind}, ${b.format}, ${user.id})
  `;
  return Response.json({ ok: true });
}
