import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [doc] = await sql`
    select id, filename, generated_at from statement_log
    where company_id = ${company.id} and snapshot_id = ${params.id} and kind = 'management_summary'
    order by generated_at desc limit 1
  `;
  return Response.json(doc || null);
}
