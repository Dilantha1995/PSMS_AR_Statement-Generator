import { sql } from '@/lib/db';
import { sectorOf } from '@/lib/arEngine';

/**
 * Rebuilds the full sector analysis (sector summary + three customer-wise
 * tables) for a given snapshot — the same shape as statement_generator_V5.html's
 * buildAnalysis(), but sourced from the database instead of in-memory state.
 */
export async function buildDashboardAnalysis(companyId, snapshotId) {
  const invoices = await sql`
    select i.*, c.type as customer_type, c.id as resolved_customer_id, c.name as resolved_customer_name
    from ar_invoices i
    left join customers c on c.id = i.customer_id
    where i.snapshot_id = ${snapshotId}
  `;
  const payments = await sql`
    select customer_id, sum(amount)::numeric as amount
    from payments
    where company_id = ${companyId} and snapshot_id = ${snapshotId}
    group by customer_id
  `;
  const paidByCustomer = {};
  for (const p of payments) if (p.customer_id) paidByCustomer[p.customer_id] = Number(p.amount);

  const byCustomer = new Map();
  for (const inv of invoices) {
    const key = inv.resolved_customer_id || inv.customer_name_raw;
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        id: inv.resolved_customer_id,
        name: inv.resolved_customer_name || inv.customer_name_raw,
        sector: sectorOf(inv.customer_type || inv.pgs_raw),
        submit: 0, pay: 0, qb: 0,
      });
    }
    const c = byCustomer.get(key);
    const open = Number(inv.open_balance);
    c.qb += open;
    if (inv.status_class === 'pending_moft') c.submit += open;
    else if (inv.status_class === 'pending_payment') c.pay += open;
  }

  const gvtCustomers = [], pvtCustomers = [], semiCustomers = [];
  for (const c of byCustomer.values()) {
    const paid = (c.id && paidByCustomer[c.id]) || 0;
    if (c.sector === 'GVT') {
      const gross = c.submit + c.pay;
      gvtCustomers.push({ name: c.name, submit: c.submit, pay: c.pay, paid, gross, submitPct: gross ? c.submit / gross : 0, payPct: gross ? c.pay / gross : 0, net: gross - paid });
    } else if (c.sector === 'SEMI') {
      semiCustomers.push({ name: c.name, qb: c.qb, paid, net: c.qb - paid });
    } else {
      pvtCustomers.push({ name: c.name, qb: c.qb, paid, net: c.qb - paid });
    }
  }
  gvtCustomers.sort((a, b) => b.gross - a.gross);
  pvtCustomers.sort((a, b) => b.qb - a.qb);
  semiCustomers.sort((a, b) => b.qb - a.qb);

  const gvtQB = gvtCustomers.reduce((s, x) => s + x.gross, 0);
  const pvtQB = pvtCustomers.reduce((s, x) => s + x.qb, 0);
  const semiQB = semiCustomers.reduce((s, x) => s + x.qb, 0);
  const gvtPaid = gvtCustomers.reduce((s, x) => s + x.paid, 0);
  const pvtPaid = pvtCustomers.reduce((s, x) => s + x.paid, 0);
  const semiPaid = semiCustomers.reduce((s, x) => s + x.paid, 0);
  const grandQB = gvtQB + pvtQB + semiQB || 1;

  return {
    gvtCustomers, pvtCustomers, semiCustomers,
    sectors: {
      gvt: { qb: gvtQB, paid: gvtPaid, net: gvtQB - gvtPaid, pct: gvtQB / grandQB },
      pvt: { qb: pvtQB, paid: pvtPaid, net: pvtQB - pvtPaid, pct: pvtQB / grandQB },
      semi: { qb: semiQB, paid: semiPaid, net: semiQB - semiPaid, pct: semiQB / grandQB },
      total: { qb: gvtQB + pvtQB + semiQB, paid: gvtPaid + pvtPaid + semiPaid, net: (gvtQB + pvtQB + semiQB) - (gvtPaid + pvtPaid + semiPaid) },
    },
  };
}
