const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Parses DD/MM/YYYY (our stored txn_date/due_date format) or a few fallbacks into a JS Date (UTC midnight). */
export function parseDMY(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { const [, d, mo, y] = m; return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const [, y, mo, d] = m; return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))); }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysPastDue(dueDateStr, asOfDate) {
  const due = parseDMY(dueDateStr);
  if (!due) return null;
  const asOf = asOfDate instanceof Date ? asOfDate : new Date(asOfDate);
  return Math.floor((Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()) - due.getTime()) / 86400000);
}

/** QuickBooks-style ageing buckets, matching the original tool's "Sheet1" grouping. */
export const AGEING_BUCKETS = ['CURRENT', '1 - 30 days past due', '31 - 60 days past due', '61 - 90 days past due', '91 or more days past due'];

export function bucketFor(days) {
  if (days === null) return 'CURRENT';
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return '1 - 30 days past due';
  if (days <= 60) return '31 - 60 days past due';
  if (days <= 90) return '61 - 90 days past due';
  return '91 or more days past due';
}

/**
 * Groups invoices into ageing buckets and flags "critical" ones past a day threshold
 * (default 150 days ≈ 5 months). asOfDate should be the snapshot's report date.
 */
export function buildAgeingReport(invoices, asOfDate, criticalDaysThreshold = 150) {
  const buckets = {};
  for (const b of AGEING_BUCKETS) buckets[b] = { invoices: [], amount: 0, open: 0 };

  const critical = [];
  for (const inv of invoices) {
    const days = daysPastDue(inv.due_date, asOfDate);
    const bucket = bucketFor(days);
    buckets[bucket].invoices.push({ ...inv, daysPastDue: days });
    buckets[bucket].amount += Number(inv.amount);
    buckets[bucket].open += Number(inv.open_balance);
    if (days !== null && days >= criticalDaysThreshold) critical.push({ ...inv, daysPastDue: days });
  }
  critical.sort((a, b) => b.daysPastDue - a.daysPastDue);

  const totalAmount = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const totalOpen = invoices.reduce((s, i) => s + Number(i.open_balance), 0);

  return { buckets, critical, totalAmount, totalOpen, criticalDaysThreshold };
}
