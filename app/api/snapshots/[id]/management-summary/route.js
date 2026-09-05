import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';
import { buildManagementSummaryData, generateNarrative } from '@/lib/managementSummary';

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [snapshot] = await sql`select id from ar_snapshots where id = ${params.id} and company_id = ${company.id}`;
  if (!snapshot) return new Response('Not found', { status: 404 });

  const data = await buildManagementSummaryData(company.id, params.id);
  const { narrative, aiGenerated } = await generateNarrative({ companyName: company.name, sectors: data.sectors, ageing: data.ageing, comparison: data.comparison });

  // Trim invoice-level arrays out of the bucket payload sent to the client — only totals/counts + the critical list are needed.
  const buckets = Object.fromEntries(Object.entries(data.ageing.buckets).map(([k, v]) => [k, { amount: v.amount, open: v.open, count: v.invoices.length }]));
  const critical = data.ageing.critical.map((i) => ({
    customer: i.customer_name_raw, invoice: i.number, dueDate: i.due_date, daysPastDue: i.daysPastDue,
    amount: Number(i.amount), openBalance: Number(i.open_balance), status: i.status,
  }));

  return Response.json({
    companyName: company.name,
    reportDate: data.snapshot.report_date,
    sectors: data.sectors,
    buckets,
    critical,
    comparison: data.comparison,
    criticalDaysThreshold: data.ageing.criticalDaysThreshold,
    narrative,
    aiGenerated,
  });
}
