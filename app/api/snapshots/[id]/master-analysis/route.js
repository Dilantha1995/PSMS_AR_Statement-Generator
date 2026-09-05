import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';
import { buildFullAnalysis } from '@/lib/analysis';
import { buildMasterAnalysisWorkbook } from '@/lib/masterAnalysisBuilder';

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [snapshot] = await sql`select * from ar_snapshots where id = ${params.id} and company_id = ${company.id}`;
  if (!snapshot) return new Response('Not found', { status: 404 });

  const analysis = await buildFullAnalysis(company.id, snapshot.id);
  const asOfDateForCalc = snapshot.report_date_parsed || new Date();
  const wb = await buildMasterAnalysisWorkbook(company.name, snapshot.report_date || 'N/A', asOfDateForCalc, analysis);
  const buffer = await wb.xlsx.writeBuffer();

  const filename = `${company.name.replace(/[^a-z0-9]+/gi, '_')}_AR_Analysis_${(snapshot.report_date || '').replace(/[^a-z0-9]+/gi, '_') || 'report'}.xlsx`;
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
