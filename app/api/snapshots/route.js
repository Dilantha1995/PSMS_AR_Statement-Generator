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
    order by s.uploaded_at desc
  `;
  return Response.json(rows);
}

export async function POST(req) {
  const { error, user, company } = await requireUserAndCompany();
  if (error) return error;

  const form = await req.formData();
  const file = form.get('file');
  if (!file) return new Response('file is required', { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseArWorkbook(buffer);
  } catch (e) {
    return new Response(`Could not parse file: ${e.message}`, { status: 422 });
  }

  const [snapshot] = await sql`
    insert into ar_snapshots (company_id, report_date, source_filename, uploaded_by, raw_diagnostics)
    values (${company.id}, ${parsed.reportDate}, ${file.name}, ${user.id}, ${JSON.stringify(parsed.diagnostics)})
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
