import * as XLSX from 'xlsx';

// --- Sector classification (identical rules to statement_generator_V5.html) ---
export function sectorOf(type) {
  const t = (type || '').toUpperCase();
  if (t === 'GVT') return 'GVT';
  if (t.startsWith('SEMI')) return 'SEMI';
  return 'PVT';
}

function excelDateToString(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    const dd = String(v.getDate()).padStart(2, '0');
    const mm = String(v.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  return String(v).trim();
}

/** Find the true source data sheet, skipping Note/Analysis sheets that share the same headers. */
function findDataSheet(wb) {
  const candidates = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const j = rows[i].map((c) => String(c).toLowerCase()).join('|');
      if (j.includes('transaction type') && j.includes('open balance')) { headerIdx = i; break; }
    }
    if (headerIdx < 0) continue;
    const topText = rows.slice(0, Math.min(rows.length, 6)).map((r) => r.map((c) => String(c).toLowerCase()).join(' ')).join(' ');
    const isNote = /^note/i.test(name) || /note\s*1\.|payment pending from mof|pending submit to mof|pending payment from mof|invoices pending submit/i.test(topText);
    candidates.push({ name, rows, headerIdx, dataRows: Math.max(0, rows.length - (headerIdx + 1)), isNote });
  }
  if (!candidates.length) return null;
  const pool = candidates.filter((c) => !c.isNote);
  const use = pool.length ? pool : candidates;
  const sheet1 = use.find((c) => c.name.toLowerCase().replace(/\s+/g, '') === 'sheet1');
  if (sheet1) return sheet1;
  use.sort((a, b) => b.dataRows - a.dataRows);
  return use[0];
}

function findCustomerMasterSheet(wb, dataSheetName) {
  for (const name of wb.SheetNames) {
    if (name === dataSheetName) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const cells = rows[i].map((c) => String(c).toLowerCase().trim());
      const hasCustomer = cells.some((c) => /^customer( name)?$/.test(c) || c === 'customer');
      const hasType = cells.some((c) => /pvt|gvt|^type$|customer type/.test(c));
      if (hasCustomer && hasType) return { name, rows, headerIdx: i };
    }
  }
  return null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Best-effort parse of the free-text "As of <date>" string into an ISO date
 * (YYYY-MM-DD), so snapshots can be compared/ordered reliably regardless of
 * how the source file formats it (DD/MM/YYYY, "31 July 2026", "Jul 31, 2026", etc).
 * Returns null if the string can't be confidently parsed.
 */
export function parseReportDateFlexible(str) {
  if (!str) return null;
  const s = String(str).trim();

  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (Number(mo) <= 12) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // YYYY-MM-DD already
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;

  // "31 July 2026" / "July 31, 2026" / "31 Jul 2026"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`; }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}


/**
 * Parse an uploaded A/R Ageing Detail Report workbook (Buffer/ArrayBuffer)
 * into { reportDate, companyName, invoices[], diagnostics }.
 * `invoices` is a flat list (not grouped) — grouping/rollups happen in SQL once persisted.
 */
export function parseArWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const diagnostics = { warnings: [], info: {} };

  const dataSheet = findDataSheet(wb);
  if (!dataSheet) throw new Error('Could not find the A/R Ageing data sheet (needs "Transaction type" and "Open balance" headers).');
  diagnostics.info.dataSheet = dataSheet.name;

  const masterSheet = findCustomerMasterSheet(wb, dataSheet.name);
  diagnostics.info.masterSheet = masterSheet ? masterSheet.name : '(none)';
  const masterMap = {};
  if (masterSheet) {
    const cm = masterSheet.rows;
    const header = cm[masterSheet.headerIdx].map((c) => String(c).toLowerCase().trim());
    const nameCol = header.findIndex((c) => /^customer( name)?$/.test(c));
    const typeCol = header.findIndex((c) => /pvt|gvt|^type$|customer type/.test(c));
    for (let i = masterSheet.headerIdx + 1; i < cm.length; i++) {
      const nm = String(cm[i][nameCol] || '').trim();
      if (nm) masterMap[nm.toLowerCase()] = { type: typeCol >= 0 ? String(cm[i][typeCol] || '').trim().toUpperCase() : '' };
    }
  }
  const lookupType = (custName) => {
    if (!custName) return '';
    const key = custName.toLowerCase().trim();
    if (masterMap[key]) return masterMap[key].type;
    for (const [mk, mv] of Object.entries(masterMap)) if (key.startsWith(mk) || mk.startsWith(key)) return mv.type;
    return '';
  };

  const rows = dataSheet.rows;
  let reportDate = '', companyName = '';
  for (const r of rows.slice(0, dataSheet.headerIdx)) {
    const a = String(r[0] || '').trim();
    if (!a) continue;
    const m = a.match(/As of\s+(.+)/i);
    if (m) { reportDate = m[1].trim(); continue; }
    if (!companyName && !/^a\/?r ageing/i.test(a) && !/^as of/i.test(a)) companyName = a;
  }
  if (!companyName) companyName = 'Company Name';
  diagnostics.info.companyName = companyName;
  diagnostics.info.reportDate = reportDate || '(not detected)';

  const headerIdx = dataSheet.headerIdx;
  const header = rows[headerIdx].map((c) => String(c).toLowerCase().trim());
  const findCol = (al) => { for (const a of al) { const i = header.findIndex((h) => h === a || h.includes(a)); if (i >= 0) return i; } return -1; };
  const ix = {
    date: findCol(['date']), type: findCol(['transaction type', 'transaction']), number: findCol(['number', 'invoice number', 'doc no']),
    po: findCol(['po number', 'po', 'purchase order']), customer: findCol(['customer full name', 'customer name', 'customer']),
    due: findCol(['due date', 'due']), amount: findCol(['amount']), open: findCol(['open balance', 'balance', 'open']),
    pgs: findCol(['pvt/gvt/semi gvt', 'pvt/gvt', 'customer type', 'type']), status: findCol(['status of payment', 'status', 'payment status']),
    details: findCol(['details pending', 'details']),
  };
  for (const k of ['date', 'type', 'number', 'customer', 'open', 'status']) if (ix[k] < 0) diagnostics.warnings.push(`Could not locate column for "${k}". Statements may be incomplete.`);

  const invoices = [];
  let skippedRows = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const customer = String(r[ix.customer] || '').trim();
    const txType = String(r[ix.type] || '').trim();
    if (!customer || !txType) { skippedRows++; continue; }
    const tl = txType.toLowerCase();
    if (tl !== 'invoice' && tl !== 'credit memo') { skippedRows++; continue; }
    const open = Number(r[ix.open] || 0);
    const status = String(r[ix.status] || '').trim();
    if (Math.abs(open) < 0.01) continue;
    const sl = status.toLowerCase();
    const statusClass = /could not be found|contact agency/.test(sl) ? 'pending_moft' : 'pending_payment';
    const type = lookupType(customer) || String(r[ix.pgs] || '').trim().toUpperCase();
    invoices.push({
      customerName: customer,
      customerType: type,
      date: excelDateToString(r[ix.date]), type: txType, number: String(r[ix.number] || '').trim(),
      po: String(r[ix.po] || '').trim(), due: excelDateToString(r[ix.due]),
      amount: Number(r[ix.amount] || 0), open, pgs: String(r[ix.pgs] || '').trim().toUpperCase(),
      status, statusClass, details: ix.details >= 0 ? String(r[ix.details] || '').trim() : '',
    });
  }
  diagnostics.info.invoicesProcessed = invoices.length;
  diagnostics.info.skippedRows = skippedRows;
  diagnostics.info.customersFound = new Set(invoices.map((i) => i.customerName)).size;

  const reportDateISO = parseReportDateFlexible(reportDate);
  if (!reportDateISO) diagnostics.warnings.push(`Could not confidently parse the report date "${reportDate}" — this upload will not be blocked as a duplicate/older report, so please check the date manually.`);

  return { reportDate, reportDateISO, companyName, invoices, diagnostics };
}
