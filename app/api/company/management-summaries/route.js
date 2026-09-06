import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET() {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const rows = await sql`
    select l.id, l.filename, l.generated_at, s.report_date, u.full_name as generated_by_name
    from statement_log l
    left join ar_snapshots s on s.id = l.snapshot_id
    left join app_users u on u.id = l.generated_by
    where l.company_id = ${company.id} and l.kind = 'management_summary'
    order by l.generated_at desc
    limit 100
  `;
  return Response.json(rows);
}
