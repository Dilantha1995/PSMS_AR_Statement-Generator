import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

/**
 * Data the "Auto Update AR" page needs to fill a raw QuickBooks export:
 * every customer's profile type (for the PVT/GVT column) and each invoice's
 * status on the latest upload (offered as the starting value for Status, so
 * only what's changed needs re-checking on Bandeyri).
 */
export async function GET() {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [customers, [latest]] = await Promise.all([
    sql`select name, type from customers where company_id = ${company.id}`,
    sql`
      select id, report_date from ar_snapshots
      where company_id = ${company.id}
      order by report_date_parsed desc nulls last, uploaded_at desc limit 1
    `,
  ]);
  const statuses = latest
    ? await sql`select number, status from ar_invoices where snapshot_id = ${latest.id} and number <> ''`
    : [];

  return Response.json({
    companyCode: company.code,
    customers,
    lastReportDate: latest?.report_date || null,
    lastStatuses: Object.fromEntries(statuses.map((s) => [s.number, s.status || ''])),
  });
}
