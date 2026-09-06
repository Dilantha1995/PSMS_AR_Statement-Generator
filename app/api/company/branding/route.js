import { sql } from '@/lib/db';
import { getCurrentUser, getCurrentCompany } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const company = await getCurrentCompany();
  if (!company) return new Response('No company selected', { status: 400 });

  const [row] = await sql`
    select code, name, logo_base64, logo_mime, letterhead_base64, letterhead_mime,
      letterhead_footer_base64, letterhead_footer_mime, report_prefix
    from companies where id = ${company.id}
  `;
  return Response.json(row);
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (user.role !== 'admin') return new Response('Admin access required', { status: 403 });
  const company = await getCurrentCompany();
  if (!company) return new Response('No company selected', { status: 400 });

  const b = await req.json();
  if (b.logo_mime && !b.logo_mime.startsWith('image/')) return new Response('Logo must be an image file (PNG/JPG).', { status: 400 });
  if (b.letterhead_mime && !b.letterhead_mime.startsWith('image/')) return new Response('Letterhead must be an image file (PNG/JPG), not a PDF or document.', { status: 400 });
  if (b.letterhead_footer_mime && !b.letterhead_footer_mime.startsWith('image/')) return new Response('Letterhead footer must be an image file.', { status: 400 });

  const [current] = await sql`
    select logo_base64, logo_mime, letterhead_base64, letterhead_mime,
      letterhead_footer_base64, letterhead_footer_mime, report_prefix
    from companies where id = ${company.id}
  `;

  const merged = {
    logo_base64: b.logo_base64 !== undefined ? b.logo_base64 : current.logo_base64,
    logo_mime: b.logo_base64 !== undefined ? (b.logo_mime || null) : current.logo_mime,
    letterhead_base64: b.letterhead_base64 !== undefined ? b.letterhead_base64 : current.letterhead_base64,
    letterhead_mime: b.letterhead_base64 !== undefined ? (b.letterhead_mime || null) : current.letterhead_mime,
    letterhead_footer_base64: b.letterhead_footer_base64 !== undefined ? b.letterhead_footer_base64 : current.letterhead_footer_base64,
    letterhead_footer_mime: b.letterhead_footer_base64 !== undefined ? (b.letterhead_footer_mime || null) : current.letterhead_footer_mime,
    report_prefix: b.report_prefix !== undefined ? (b.report_prefix || null) : current.report_prefix,
  };

  await sql`
    update companies set
      logo_base64 = ${merged.logo_base64}, logo_mime = ${merged.logo_mime},
      letterhead_base64 = ${merged.letterhead_base64}, letterhead_mime = ${merged.letterhead_mime},
      letterhead_footer_base64 = ${merged.letterhead_footer_base64}, letterhead_footer_mime = ${merged.letterhead_footer_mime},
      report_prefix = ${merged.report_prefix}
    where id = ${company.id}
  `;
  return Response.json({ ok: true });
}
