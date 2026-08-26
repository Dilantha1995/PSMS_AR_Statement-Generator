import { sql } from '@/lib/db';
import { requireUserAndCompany } from '@/lib/session';

const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export async function GET(_req, { params }) {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;

  const [doc] = await sql`select * from statement_log where id = ${params.id} and company_id = ${company.id}`;
  if (!doc || !doc.file_base64) return new Response('Not found', { status: 404 });

  const bytes = Buffer.from(doc.file_base64, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': MIME[doc.format] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.filename || 'document'}"`,
    },
  });
}
