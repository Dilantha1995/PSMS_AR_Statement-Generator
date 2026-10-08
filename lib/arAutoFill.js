import * as XLSX from 'xlsx';
import { findDataSheet, sectorOf } from './arEngine';

// Helpers behind the "Auto Update AR" button: take the raw A/R Ageing Detail
// export straight from QuickBooks Online and fill in the two columns that used
// to be typed by hand — "PVT/GVT" (from the customer profiles) and "Status"
// (from Bandeyri for GVT, "Pending" for everyone else) — so it can be uploaded
// as-is. Pure functions; used in the browser and in tests.

export const BANDEYRI_URL = 'https://bandeyri.finance.gov.mv/public/paymentstatus';
export const BANDEYRI_BATCH = 10; // Bandeyri accepts at most 10 invoice numbers per search
export const NOT_FOUND_STATUS = 'Requested document could not be found. Please contact agency.';
export const NON_GVT_STATUS = 'Pending';

/** Customer profile type (GVT / PVT / SEMI) → the label used in the PVT/GVT column. */
export function pgsLabel(type) {
  const s = sectorOf(type);
  return s === 'SEMI' ? 'SEMI/GVT' : s;
}

const norm = (s) => String(s ?? '').trim();

/**
 * Locate the data sheet and the invoice rows in a QuickBooks export.
 * Returns { sheetName, headerRow, cols: {customer, number, type, pgs, status}, lastCol, invoices[] }
 * where row/col numbers are absolute worksheet coordinates (0-based).
 */
export function readQbExport(wb) {
  const ds = findDataSheet(wb);
  if (!ds) throw new Error('Could not find the A/R Ageing data sheet (needs "Transaction type" and "Open balance" headers). Is this the A/R Ageing Detail export?');
  const ws = wb.Sheets[ds.name];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const header = ds.rows[ds.headerIdx].map((c) => norm(c).toLowerCase());
  const find = (pred) => header.findIndex(pred);

  const rel = {
    customer: find((h) => h === 'customer full name' || h === 'customer name' || h === 'customer'),
    type: find((h) => h === 'transaction type'),
    number: find((h) => h === 'num' || h === 'number' || h === 'no.' || h === 'invoice number'),
    open: find((h) => h === 'open balance'),
    pgs: find((h) => h.includes('pvt/gvt')),
    status: find((h) => h.includes('status')),
  };
  if (rel.customer < 0) rel.customer = find((h) => h.includes('customer'));
  if (rel.number < 0) rel.number = find((h) => h.includes('num') && !h.includes('po'));
  for (const k of ['customer', 'type', 'number']) {
    if (rel[k] < 0) throw new Error(`Could not find the "${k}" column in the export.`);
  }

  const abs = (c) => (c < 0 ? -1 : range.s.c + c);
  const invoices = [];
  for (let i = ds.headerIdx + 1; i < ds.rows.length; i++) {
    const r = ds.rows[i];
    const customer = norm(r[rel.customer]);
    const txType = norm(r[rel.type]).toLowerCase();
    if (!customer || (txType !== 'invoice' && txType !== 'credit memo')) continue;
    invoices.push({
      row: range.s.r + i,
      customer,
      number: norm(r[rel.number]),
      open: Number(r[rel.open] || 0),
      existingPgs: rel.pgs >= 0 ? norm(r[rel.pgs]) : '',
      existingStatus: rel.status >= 0 ? norm(r[rel.status]) : '',
    });
  }

  return {
    sheetName: ds.name,
    headerRow: range.s.r + ds.headerIdx,
    cols: { pgs: abs(rel.pgs), status: abs(rel.status) },
    lastCol: range.e.c,
    invoices,
  };
}

/** Case-insensitive customer → profile type lookup, with the same prefix fallback the parser uses. */
export function makeTypeLookup(customers) {
  const map = new Map(customers.map((c) => [norm(c.name).toLowerCase(), c.type]));
  return (name) => {
    const key = norm(name).toLowerCase();
    if (map.has(key)) return map.get(key);
    for (const [k, v] of map) if (key.startsWith(k) || k.startsWith(key)) return v;
    return null;
  };
}

/** Split invoice numbers into Bandeyri search strings: up to 10, comma-separated, no spaces. */
export function bandeyriBatches(numbers) {
  const out = [];
  for (let i = 0; i < numbers.length; i += BANDEYRI_BATCH) out.push(numbers.slice(i, i + BANDEYRI_BATCH));
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pull statuses out of text copied from the Bandeyri results page (select all → copy → paste).
 * Recognises "Document: PS/INV/26/444 parked on: 17.09.2026" (parked / posted / cleared / …)
 * and the "Requested document could not be found" message on the same or following
 * lines as an invoice number. Returns Map(invoiceNumber → status).
 */
export function parseBandeyriText(text, numbers) {
  const found = new Map();
  if (!text) return found;

  const docRe = /Document:\s*(\S+)\s+([A-Za-z]+)\s+on:\s*(\d{1,2}\.\d{1,2}\.\d{4})/g;
  for (const m of text.matchAll(docRe)) {
    found.set(m[1], `Document: ${m[1]} ${m[2].toLowerCase()} on: ${m[3]}`);
  }

  const lines = text.split(/\r?\n/);
  const numRes = numbers.map((n) => [n, new RegExp(`(^|[^\\w/])${escapeRe(n)}(?![\\w/])`)]);
  const lineHasAnyNumber = (line) => numRes.some(([, re]) => re.test(line));
  for (const [n, re] of numRes) {
    if (found.has(n)) continue;
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      // The message may sit on the same line (table row) or just below it.
      for (let j = i; j < Math.min(lines.length, i + 3); j++) {
        if (j > i && lineHasAnyNumber(lines[j])) break;
        if (/could not be found/i.test(lines[j])) { found.set(n, NOT_FOUND_STATUS); break; }
      }
      if (found.has(n)) break;
    }
  }
  return found;
}

/**
 * Write the PVT/GVT and Status values into the workbook in place.
 * Existing columns with those headers are overwritten; otherwise two new
 * columns are added after the last used column.
 * `fills` is an array parallel to `qb.invoices` of { pgs, status }.
 */
export function writeFills(wb, qb, fills) {
  const ws = wb.Sheets[qb.sheetName];
  let next = qb.lastCol + 1;
  const pgsCol = qb.cols.pgs >= 0 ? qb.cols.pgs : next++;
  const statusCol = qb.cols.status >= 0 ? qb.cols.status : next++;

  const put = (r, c, v) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v: String(v ?? '') }; };
  put(qb.headerRow, pgsCol, 'PVT/GVT');
  put(qb.headerRow, statusCol, 'Status');
  qb.invoices.forEach((inv, i) => {
    put(inv.row, pgsCol, fills[i].pgs);
    put(inv.row, statusCol, fills[i].status);
  });

  const range = XLSX.utils.decode_range(ws['!ref']);
  range.e.c = Math.max(range.e.c, pgsCol, statusCol);
  ws['!ref'] = XLSX.utils.encode_range(range);
  return wb;
}
