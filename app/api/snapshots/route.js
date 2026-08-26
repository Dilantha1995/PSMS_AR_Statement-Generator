import { sql } from '@/lib/db';
import { parseArWorkbook, sectorOf } from '@/lib/arEngine';
import { requireUserAndCompany } from '@/lib/session';

/** List past uploads (the history view) for the current company. */
export async function GET() {
  const { error, company } = await requireUserAndCompany();
  if (error) return error;
  const rows = await sql`
    select s.*, u.full_name as uploaded_by_name,
      (select count(*) from ar_invoices i where i.snapshot_id = s.id) as invoice_count,
      (select coalesce(sum(open_balance),0) from ar_invoices i where i.snapshot_id = s.id) as total_open
    from ar_snapshots s
    left join app_users u on u.id = s.uploaded_by
    where s.company_id = ${company.id}
    order by s.report_date_parsed desc nulls last, s.uploaded_at desc
  `;
  return Response.json(rows);
}

export async function POST(req) {
  const { error, user, company } = await requireUserAndCompany();
  if (error) return error;

  const form = await req.formData();
  const file = form.get('file');
  const force = form.get('force') === 'true';
  if (!file) return new Response('file is required', { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseArWorkbook(buffer);
  } catch (e) {
    return new Response(`Could not parse file: ${e.message}`, { status: 422 });
  }

  // Refuse to save a report that's older than (or the same date as) the
  // newest one already on file for this company — the dashboard, customer
  // balances, and SOA generator all key off the latest snapshot, so an
  // accidental re-upload of a stale file would silently roll the numbers back.
  if (parsed.reportDateISO && !force) {
    const [latest] = await sql`
      select report_date, report_date_parsed from ar_snapshots
      where company_id = ${company.id} and report_date_parsed is not null
      order by report_date_parsed desc limit 1
    `;
    if (latest && parsed.reportDateISO <= latest.report_date_parsed) {
      return Response.json({
        rejected: true,
        reason: `This file is dated ${parsed.reportDate} (${parsed.reportDateISO}), which is not newer than the latest report already on file for ${company.name}, dated ${latest.report_date} (${latest.report_date_parsed}). It was not saved so it can't overwrite the current balances. If you really need to add it anyway (e.g. backfilling history), re-upload with "force" checked.`,
      }, { status: 409 });
    }
  }

  const [snapshot] = await sql`
    insert into ar_snapshots (company_id, report_date, report_date_parsed, source_filename, uploaded_by, raw_diagnostics)
    values (${company.id}, ${parsed.reportDate}, ${parsed.reportDateISO}, ${file.name}, ${user.id}, ${JSON.stringify(parsed.diagnostics)})
    returning *
  `;

  // Upsert customers seen in this file (new customers get created automatically;
  // existing ones keep their profile — only type is refreshed from the source file).
  const uniqueCustomers = new Map();
  for (const inv of parsed.invoices) {
    if (!uniqueCustomers.has(inv.customerName)) uniqueCustomers.set(inv.customerName, inv.customerType);
  }
  const customerIdByName = {};
  for (const [name, type] of uniqueCustomers) {
    const [row] = await sql`
      insert into customers (company_id, name, type)
      values (${company.id}, ${name}, ${type || 'PVT'})
      on conflict (company_id, name) do update set
        type = coalesce(nullif(excluded.type, ''), customers.type), updated_at = now()
      returning id
    `;
    customerIdByName[name] = row.id;
  }

  // Bulk insert invoice lines for this snapshot.
  for (const inv of parsed.invoices) {
    await sql`
      insert into ar_invoices
        (snapshot_id, customer_id, customer_name_raw, txn_date, txn_type, number, po_number,
         due_date, amount, open_balance, pgs_raw, status, status_class, details_pending)
      values (
        ${snapshot.id}, ${customerIdByName[inv.customerName]}, ${inv.customerName}, ${inv.date}, ${inv.type},
        ${inv.number}, ${inv.po}, ${inv.due}, ${inv.amount}, ${inv.open}, ${inv.pgs}, ${inv.status},
        ${inv.statusClass}, ${inv.details}
      )
    `;
  }

  return Response.json({
    snapshot,
    diagnostics: parsed.diagnostics,
    customersFound: uniqueCustomers.size,
    invoicesProcessed: parsed.invoices.length,
  });
}
