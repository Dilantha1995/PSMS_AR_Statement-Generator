import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

export async function GET() {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;
  const rows = await sql`
    select l.id, l.kind, l.format, l.filename, l.generated_at, c.name as customer_name, u.full_name as generated_by_name
    from statement_log l
    left join customers c on c.id = l.customer_id
    left join app_users u on u.id = l.generated_by
    where l.company_id = ${company.id}
    order by l.generated_at desc
    limit 200
  `;
  return Response.json(rows);
}

export async function POST(req) {
  const { error, user, company } = await requireUserAndCompany();
  if (error) return error;
  const b = await req.json();

  // The Management Summary Report is one-per-snapshot: regenerating it (e.g. after fixing
  // the letterhead, or once new payments are logged) should update that same history entry,
  // not pile up duplicates every time someone re-downloads it with fresh branding/data.
  if (b.kind === 'management_summary' && b.snapshot_id) {
    const [existing] = await sql`
      select id from statement_log where company_id = ${company.id} and snapshot_id = ${b.snapshot_id} and kind = 'management_summary'
    `;
    if (existing) {
      await sql`
        update statement_log set filename = ${b.filename}, file_base64 = ${b.file_base64}, generated_by = ${user.id}, generated_at = now()
        where id = ${existing.id}
      `;
      return Response.json({ ok: true, id: existing.id });
    }
  }

  const [row] = await sql`
    insert into statement_log (company_id, customer_id, snapshot_id, kind, format, filename, file_base64, generated_by)
    values (${company.id}, ${b.customer_id || null}, ${b.snapshot_id || null}, ${b.kind}, ${b.format}, ${b.filename}, ${b.file_base64}, ${user.id})
    returning id
  `;
  return Response.json({ ok: true, id: row.id });
}
