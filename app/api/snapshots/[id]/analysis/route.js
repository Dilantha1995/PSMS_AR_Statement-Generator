import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';
import { buildFullAnalysis } from '@/lib/analysis';

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [snapshot] = await sql`select * from ar_snapshots where id = ${params.id} and company_id = ${company.id}`;
  if (!snapshot) return new Response('Not found', { status: 404 });

  const full = await buildFullAnalysis(company.id, snapshot.id);
  // Strip the heavy per-invoice arrays — the client only needs the summary shape here.
  const { invoices, note12, note13, note22, note24, ...analysis } = full;
  return Response.json({ snapshot, analysis });
}
