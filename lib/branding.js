import { sql } from '@/lib/db';

export async function getCompanyBranding(companyId) {
  const [row] = await sql`
    select code, name, logo_base64, logo_mime, letterhead_base64, letterhead_mime, report_prefix
    from companies where id = ${companyId}
  `;
  return row;
}

/**
 * Atomically issues the next reference number for a company for the current year,
 * formatted as "<prefix>/<year>/<seq padded to 3 digits>", e.g. "PSMS/ACC/AR/2026/003".
 * The prefix defaults to "<companyCode>/ACC/AR" but can be overridden per company.
 */
export async function getNextReferenceNumber(companyId) {
  const [company] = await sql`select code, report_prefix from companies where id = ${companyId}`;
  const prefix = company.report_prefix || `${company.code}/ACC/AR`;
  const year = new Date().getFullYear();

  const [row] = await sql`
    insert into report_counters (company_id, year, seq)
    values (${companyId}, ${year}, 1)
    on conflict (company_id, year) do update set seq = report_counters.seq + 1
    returning seq
  `;
  const seq = String(row.seq).padStart(3, '0');
  return `${prefix}/${year}/${seq}`;
}
