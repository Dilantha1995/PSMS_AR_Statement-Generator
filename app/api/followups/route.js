import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

const OUTCOMES = ['promised_date', 'paid', 'disputed', 'no_response', 'partial_payment', 'other'];

export async function POST(req) {
  const { error, user, company } = await requireUserAndCompany();
  if (error) return error;
  const b = await req.json();

  if (!b.customer_id) return new Response('customer_id is required', { status: 400 });
  if (!b.note?.trim()) return new Response('note is required', { status: 400 });
  if (!OUTCOMES.includes(b.outcome)) return new Response(`outcome must be one of ${OUTCOMES.join(', ')}`, { status: 400 });

  const [row] = await sql`
    insert into followups
      (company_id, customer_id, followup_date, note, outcome, promised_date, amount_discussed, next_action_date, logged_by)
    values (
      ${company.id}, ${b.customer_id}, ${b.followup_date || new Date().toISOString().slice(0, 10)},
      ${b.note.trim()}, ${b.outcome},
      ${b.outcome === 'promised_date' ? b.promised_date || null : null},
      ${b.amount_discussed ?? null}, ${b.next_action_date || null}, ${user.id}
    )
    returning *
  `;
  return Response.json(row);
}

/**
 * GET /api/followups?from=YYYY-MM-DD&to=YYYY-MM-DD&customer_id=...
 * Powers the "follow-up report for a period" — for one customer if customer_id
 * is given, otherwise across every customer in the current company.
 */
export async function GET(req) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || '1900-01-01';
  const to = searchParams.get('to') || '2999-12-31';
  const customerId = searchParams.get('customer_id');

  const rows = await sql`
    select f.*, c.name as customer_name, c.type as customer_type, u.full_name as logged_by_name
    from followups f
    join customers c on c.id = f.customer_id
    left join app_users u on u.id = f.logged_by
    where f.company_id = ${company.id}
      and f.followup_date between ${from} and ${to}
      and (${customerId}::uuid is null or f.customer_id = ${customerId})
    order by f.followup_date desc, f.created_at desc
  `;
  return Response.json(rows);
}
