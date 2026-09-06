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

/**
 * Ensures a snapshot has a Management Summary reference number, assigning one only if it
 * doesn't already have one. The common case (already assigned) is a single cheap read that
 * never touches the counter — the atomic increment-and-set below only runs the one time a
 * snapshot is first numbered, and even then is race-safe against a double-click or two open
 * tabs: Postgres serializes concurrent UPDATEs on the same row, so whichever commits first
 * "wins" and the second sees that committed value via COALESCE rather than overwriting it.
 */
export async function ensureManagementSummaryRef(companyId, snapshotId) {
  const [existing] = await sql`select management_summary_ref from ar_snapshots where id = ${snapshotId} and company_id = ${companyId}`;
  if (existing?.management_summary_ref) return existing.management_summary_ref;

  const [company] = await sql`select code, report_prefix from companies where id = ${companyId}`;
  const prefix = company.report_prefix || `${company.code}/ACC/AR`;
  const year = new Date().getFullYear();

  const [row] = await sql`
    with counted as (
      insert into report_counters (company_id, year, seq)
      values (${companyId}, ${year}, 1)
      on conflict (company_id, year) do update set seq = report_counters.seq + 1
      returning seq
    )
    update ar_snapshots
    set management_summary_ref = coalesce(
      ar_snapshots.management_summary_ref,
      ${prefix} || '/' || ${year} || '/' || lpad((select seq from counted)::text, 3, '0')
    )
    where id = ${snapshotId} and company_id = ${companyId}
    returning management_summary_ref
  `;
  return row?.management_summary_ref;
}
