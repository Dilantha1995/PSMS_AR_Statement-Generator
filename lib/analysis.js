import { sql } from '@/lib/db';
import { sectorOf } from '@/lib/arEngine';

/**
 * Rebuilds the full sector analysis for a given snapshot — sector summary,
 * three customer-wise tables, per-customer invoice groupings for the Note
 * sheets, and payment detail rows per sector. Same shape as the original
 * standalone tool's buildAnalysis(), sourced from the database.
 */
export async function buildFullAnalysis(companyId, snapshotId) {
  const invoices = await sql`
    select i.*, c.type as customer_type, c.id as resolved_customer_id, c.name as resolved_customer_name
    from ar_invoices i
    left join customers c on c.id = i.customer_id
    where i.snapshot_id = ${snapshotId}
    order by i.customer_name_raw, i.txn_date
  `;
  const paymentRows = await sql`
    select p.*, c.name as customer_name, c.type as customer_type
    from payments p
    left join customers c on c.id = p.customer_id
    where p.company_id = ${companyId}
    order by p.pay_date
  `;
  const paidByCustomer = {};
  for (const p of paymentRows) if (p.customer_id) paidByCustomer[p.customer_id] = (paidByCustomer[p.customer_id] || 0) + Number(p.amount);

  const byCustomer = new Map();
  for (const inv of invoices) {
    const key = inv.resolved_customer_id || inv.customer_name_raw;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        id: inv.resolved_customer_id,
        name: inv.resolved_customer_name || inv.customer_name_raw,
        sector: sectorOf(inv.customer_type || inv.pgs_raw),
        submit: 0, pay: 0, qb: 0,
        pendingMoft: [], pendingPayment: [], allInvoices: [],
      });
    }
    const c = byCustomer.get(key);
    const open = Number(inv.open_balance);
    c.qb += open;
    c.allInvoices.push(inv);
    if (inv.status_class === 'pending_moft') { c.submit += open; c.pendingMoft.push(inv); }
    else if (inv.status_class === 'pending_payment') { c.pay += open; c.pendingPayment.push(inv); }
  }

  const gvtCustomers = [], pvtCustomers = [], semiCustomers = [];
  const note12 = [], note13 = [], note22 = [], note24 = [];
  for (const c of byCustomer.values()) {
    const paid = (c.id && paidByCustomer[c.id]) || 0;
    if (c.sector === 'GVT') {
      const gross = c.submit + c.pay;
      gvtCustomers.push({ name: c.name, submit: c.submit, pay: c.pay, paid, gross, submitPct: gross ? c.submit / gross : 0, payPct: gross ? c.pay / gross : 0, net: gross - paid });
      if (c.pendingMoft.length) note13.push({ name: c.name, invoices: c.pendingMoft, subtotal: c.pendingMoft.reduce((s, x) => s + Number(x.open_balance), 0) });
      if (c.pendingPayment.length) note12.push({ name: c.name, invoices: c.pendingPayment, subtotal: c.pendingPayment.reduce((s, x) => s + Number(x.open_balance), 0) });
    } else if (c.sector === 'SEMI') {
      semiCustomers.push({ name: c.name, qb: c.qb, paid, net: c.qb - paid });
      if (c.allInvoices.length) note24.push({ name: c.name, invoices: c.allInvoices, subtotal: c.qb });
    } else {
      pvtCustomers.push({ name: c.name, qb: c.qb, paid, net: c.qb - paid });
      if (c.allInvoices.length) note22.push({ name: c.name, invoices: c.allInvoices, subtotal: c.qb });
    }
  }
  gvtCustomers.sort((a, b) => b.gross - a.gross);
  pvtCustomers.sort((a, b) => b.qb - a.qb);
  semiCustomers.sort((a, b) => b.qb - a.qb);
  note12.sort((a, b) => b.subtotal - a.subtotal);
  note13.sort((a, b) => b.subtotal - a.subtotal);
  note22.sort((a, b) => b.subtotal - a.subtotal);
  note24.sort((a, b) => b.subtotal - a.subtotal);

  const gvtQB = gvtCustomers.reduce((s, x) => s + x.gross, 0);
  const pvtQB = pvtCustomers.reduce((s, x) => s + x.qb, 0);
  const semiQB = semiCustomers.reduce((s, x) => s + x.qb, 0);
  const gvtPaid = gvtCustomers.reduce((s, x) => s + x.paid, 0);
  const pvtPaid = pvtCustomers.reduce((s, x) => s + x.paid, 0);
  const semiPaid = semiCustomers.reduce((s, x) => s + x.paid, 0);
  const grandQB = gvtQB + pvtQB + semiQB || 1;

  const gvtPaidDetails = [], pvtPaidDetails = [], semiPaidDetails = [];
  for (const p of paymentRows) {
    const sec = sectorOf(p.customer_type);
    const row = { date: p.pay_date, customer: p.customer_name, reference: p.reference, amount: Number(p.amount) };
    if (sec === 'GVT') gvtPaidDetails.push(row);
    else if (sec === 'SEMI') semiPaidDetails.push(row);
    else pvtPaidDetails.push(row);
  }

  return {
    invoices, gvtCustomers, pvtCustomers, semiCustomers,
    note12, note13, note22, note24, gvtPaidDetails, pvtPaidDetails, semiPaidDetails,
    sectors: {
      gvt: { qb: gvtQB, paid: gvtPaid, net: gvtQB - gvtPaid, pct: gvtQB / grandQB },
      pvt: { qb: pvtQB, paid: pvtPaid, net: pvtQB - pvtPaid, pct: pvtQB / grandQB },
      semi: { qb: semiQB, paid: semiPaid, net: semiQB - semiPaid, pct: semiQB / grandQB },
      total: { qb: gvtQB + pvtQB + semiQB, paid: gvtPaid + pvtPaid + semiPaid, net: (gvtQB + pvtQB + semiQB) - (gvtPaid + pvtPaid + semiPaid) },
    },
  };
}

/** Backward-compatible alias used by the on-screen dashboard (only needs the summary shape). */
export const buildDashboardAnalysis = buildFullAnalysis;
