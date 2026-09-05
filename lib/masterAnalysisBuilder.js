import ExcelJS from 'exceljs';
import { AGEING_BUCKETS, buildAgeingReport } from '@/lib/ageing';

const GREEN = 'FF1A6B4F', GREEN900 = 'FF0F3D2E', BLUE = 'FF0A5FA8', LINK = 'FF0A5FA8';

function titleBlock(ws, companyName, line2, line3, asOf) {
  ws.getCell('A1').value = companyName; ws.getCell('A1').font = { bold: true, size: 13, color: { argb: GREEN900 } };
  ws.getCell('A2').value = line2; ws.getCell('A2').font = { size: 10, color: { argb: 'FF5B6C64' } };
  ws.getCell('A3').value = line3; ws.getCell('A3').font = { bold: true, size: 11 };
  ws.getCell('A4').value = `As of ${asOf}`; ws.getCell('A4').font = { size: 9, italic: true, color: { argb: 'FF5B6C64' } };
}

function headerRow(ws, rowNum, labels) {
  const row = ws.getRow(rowNum);
  labels.forEach((label, i) => { const cell = row.getCell(i + 1); cell.value = label; });
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }; cell.alignment = { vertical: 'middle' }; });
}

function moneyCell(ws, r, c, val) { const cell = ws.getCell(r, c); cell.value = Number(val) || 0; cell.numFmt = '#,##0.00'; return cell; }
function pctCell(ws, r, c, val) { const cell = ws.getCell(r, c); cell.value = Number(val) || 0; cell.numFmt = '0.0%'; return cell; }
function txtCell(ws, r, c, val, opts = {}) { const cell = ws.getCell(r, c); cell.value = val; if (opts.bold) cell.font = { bold: true }; if (opts.italic) cell.font = { ...cell.font, italic: true, color: { argb: LINK } }; return cell; }
function totalRow(ws, r, colFrom, colTo) {
  for (let c = colFrom; c <= colTo; c++) { const cell = ws.getCell(r, c); cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EE' } }; }
}

function addGVTvsPVT(wb, company, asOf, a) {
  const ws = wb.addWorksheet('GVT_Vs_PVT');
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 22 }, { width: 10 }, { width: 22 }, { width: 20 }, { width: 30 }];
  titleBlock(ws, company, 'AR Analysis', 'GVT Vs PVT Vs Semi-GVT', asOf);
  const s = a.sectors;
  headerRow(ws, 7, ['Srn', 'Sector', 'Total Outstanding - QB', '%', 'Paid & Details Pending', 'Net Outstanding', 'Note']);
  txtCell(ws, 8, 1, 1); txtCell(ws, 8, 2, 'GVT'); moneyCell(ws, 8, 3, s.gvt.qb); pctCell(ws, 8, 4, s.gvt.pct); moneyCell(ws, 8, 5, s.gvt.paid); moneyCell(ws, 8, 6, s.gvt.net); txtCell(ws, 8, 7, 'See GVT Analysis_1.1', { italic: true });
  txtCell(ws, 9, 1, 2); txtCell(ws, 9, 2, 'PVT'); moneyCell(ws, 9, 3, s.pvt.qb); pctCell(ws, 9, 4, s.pvt.pct); moneyCell(ws, 9, 5, s.pvt.paid); moneyCell(ws, 9, 6, s.pvt.net); txtCell(ws, 9, 7, 'See PVT Analysis 2.1', { italic: true });
  txtCell(ws, 10, 1, 3); txtCell(ws, 10, 2, 'Semi-GVT'); moneyCell(ws, 10, 3, s.semi.qb); pctCell(ws, 10, 4, s.semi.pct); moneyCell(ws, 10, 5, s.semi.paid); moneyCell(ws, 10, 6, s.semi.net); txtCell(ws, 10, 7, 'See Semi-GVT Analysis 2.3', { italic: true });
  txtCell(ws, 11, 2, 'Total', { bold: true }); moneyCell(ws, 11, 3, s.total.qb); moneyCell(ws, 11, 5, s.total.paid); moneyCell(ws, 11, 6, s.total.net); totalRow(ws, 11, 1, 7);

  let r = 14;
  const paidBlock = (title, dateLabel, rows) => {
    ws.getCell(r, 1).value = title; ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: GREEN900 } }; r++;
    headerRow(ws, r, ['Srn', dateLabel, 'Customer name', 'Reference', 'Amount']); r++;
    if (rows.length) {
      rows.forEach((p, i) => { txtCell(ws, r, 1, i + 1); txtCell(ws, r, 2, p.date); txtCell(ws, r, 3, p.customer); txtCell(ws, r, 4, p.reference); moneyCell(ws, r, 5, p.amount); r++; });
      moneyCell(ws, r, 5, rows.reduce((s, x) => s + x.amount, 0)); totalRow(ws, r, 1, 5); r += 2;
    } else { moneyCell(ws, r, 5, 0); totalRow(ws, r, 1, 5); r += 2; }
  };
  paidBlock('GVT - Paid and Details Pending', 'Inv/Pmt Date', a.gvtPaidDetails);
  paidBlock('PVT - Paid and Details Pending', 'Pmt Date', a.pvtPaidDetails);
}

function addGVTAnalysis(wb, company, asOf, a) {
  const ws = wb.addWorksheet('GVT Analysis_1.1');
  ws.columns = [{ width: 6 }, { width: 30 }, { width: 20 }, { width: 10 }, { width: 22 }, { width: 10 }, { width: 20 }, { width: 20 }];
  titleBlock(ws, company, 'AR Analysis', 'GVT', asOf);
  txtCell(ws, 6, 3, 'Please refer Note 1.3', { italic: true }); txtCell(ws, 6, 5, 'Please refer Note 1.2', { italic: true });
  headerRow(ws, 7, ['Srn', 'Customer Name', 'Not Submitted to MOFT', '%', 'Payment Pending from MOFT', '%', 'Paid & Details Pending', 'Total Outstanding']);
  let r = 8;
  a.gvtCustomers.forEach((c, i) => { txtCell(ws, r, 1, i + 1); txtCell(ws, r, 2, c.name); moneyCell(ws, r, 3, c.submit); pctCell(ws, r, 4, c.submitPct); moneyCell(ws, r, 5, c.pay); pctCell(ws, r, 6, c.payPct); moneyCell(ws, r, 7, c.paid); moneyCell(ws, r, 8, c.gross); r++; });
  txtCell(ws, r, 2, 'Total', { bold: true });
  moneyCell(ws, r, 3, a.gvtCustomers.reduce((s, x) => s + x.submit, 0)); moneyCell(ws, r, 5, a.gvtCustomers.reduce((s, x) => s + x.pay, 0));
  moneyCell(ws, r, 7, a.gvtCustomers.reduce((s, x) => s + x.paid, 0)); moneyCell(ws, r, 8, a.gvtCustomers.reduce((s, x) => s + x.gross, 0));
  totalRow(ws, r, 1, 8); r += 3;
  txtCell(ws, r, 1, 'Prepared by:', { bold: true }); r++;
  txtCell(ws, r, 1, 'Date:', { bold: true }); txtCell(ws, r, 2, asOf);
}

function addSectorAnalysis(wb, sheetName, company, asOf, sectorLabel, noteRef, customers, paidDetails) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ width: 6 }, { width: 32 }, { width: 22 }, { width: 22 }, { width: 22 }];
  titleBlock(ws, company, 'AR Analysis', sectorLabel, asOf);
  txtCell(ws, 6, 3, `Please refer ${noteRef}`, { italic: true });
  headerRow(ws, 7, ['Srn', 'Customer Name', 'Outstanding Amount - QB', 'Paid & Details Pending', 'Net Total Outstanding']);
  let r = 8;
  customers.forEach((c, i) => { txtCell(ws, r, 1, i + 1); txtCell(ws, r, 2, c.name); moneyCell(ws, r, 3, c.qb); moneyCell(ws, r, 4, c.paid); moneyCell(ws, r, 5, c.net); r++; });
  txtCell(ws, r, 2, 'Total', { bold: true });
  moneyCell(ws, r, 3, customers.reduce((s, x) => s + x.qb, 0)); moneyCell(ws, r, 4, customers.reduce((s, x) => s + x.paid, 0)); moneyCell(ws, r, 5, customers.reduce((s, x) => s + x.net, 0));
  totalRow(ws, r, 1, 5); r += 2;

  if (paidDetails) {
    ws.getCell(r, 1).value = `${sectorLabel} - Paid and Details Pending`; ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: GREEN900 } }; r++;
    headerRow(ws, r, ['Srn', 'Payment Date', 'Customer name', 'Reference', 'Amount']); r++;
    if (paidDetails.length) {
      paidDetails.forEach((p, i) => { txtCell(ws, r, 1, i + 1); txtCell(ws, r, 2, p.date); txtCell(ws, r, 3, p.customer); txtCell(ws, r, 4, p.reference); moneyCell(ws, r, 5, p.amount); r++; });
      moneyCell(ws, r, 5, paidDetails.reduce((s, x) => s + x.amount, 0)); totalRow(ws, r, 1, 5); r += 2;
    } else { moneyCell(ws, r, 5, 0); totalRow(ws, r, 1, 5); r += 2; }
    txtCell(ws, r, 1, 'Prepared by:', { bold: true }); r++;
    txtCell(ws, r, 1, 'Date:', { bold: true }); txtCell(ws, r, 2, asOf);
  }
}

function addNoteSheet(wb, sheetName, company, asOf, noteTag, subtitle, groups) {
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [{ width: 4 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 26 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 46 }, { width: 16 }];
  ws.getCell(1, 1).value = company; ws.getCell(1, 1).font = { bold: true, size: 12 };
  ws.getCell(1, 9).value = noteTag; ws.getCell(1, 9).font = { bold: true, size: 12, color: { argb: BLUE } };
  ws.getCell(2, 1).value = 'A/R Ageing Detail Report';
  ws.getCell(3, 1).value = subtitle; ws.getCell(3, 1).font = { bold: true };
  ws.getCell(4, 1).value = `As of ${asOf}`;
  const headerLabels = ['', 'Date', 'Transaction type', 'Number', 'PO Number', 'Customer full name', 'Due date', 'Amount', 'Open balance', 'Pvt/GVT/Semi GVT', 'Status of Payment', 'Details Pending'];
  headerRow(ws, 6, headerLabels);
  let r = 7;
  for (const g of groups) {
    ws.getCell(r, 2).value = g.name; ws.getCell(r, 2).font = { bold: true }; r++;
    for (const inv of g.invoices) {
      txtCell(ws, r, 2, inv.txn_date); txtCell(ws, r, 3, inv.txn_type); txtCell(ws, r, 4, inv.number); txtCell(ws, r, 5, inv.po_number);
      txtCell(ws, r, 6, inv.customer_name_raw); txtCell(ws, r, 7, inv.due_date); moneyCell(ws, r, 8, inv.amount); moneyCell(ws, r, 9, inv.open_balance);
      txtCell(ws, r, 10, inv.pgs_raw); txtCell(ws, r, 11, inv.status); txtCell(ws, r, 12, inv.details_pending);
      r++;
    }
    moneyCell(ws, r, 9, g.subtotal); totalRow(ws, r, 9, 9); r++;
  }
  r += 1;
  ws.getCell(r, 6).value = 'Grand Total'; ws.getCell(r, 6).font = { bold: true };
  moneyCell(ws, r, 9, groups.reduce((s, g) => s + g.subtotal, 0)); totalRow(ws, r, 9, 9);
}

function addAgeingSheet(wb, company, asOf, invoices, asOfDateForCalc) {
  const ws = wb.addWorksheet('Sheet1');
  ws.columns = [{ width: 4 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 26 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 46 }];
  ws.getCell(1, 1).value = company; ws.getCell(1, 1).font = { bold: true, size: 12 };
  ws.getCell(2, 1).value = 'A/R Ageing Detail Report';
  ws.getCell(3, 1).value = `As of ${asOf}`;
  headerRow(ws, 5, ['', 'Date', 'Transaction type', 'Number', 'PO Number', 'Customer full name', 'Due date', 'Amount', 'Open balance', 'PVT/GVT', 'Status']);

  const ageing = buildAgeingReport(invoices, asOfDateForCalc, 150);
  // Present oldest-first, matching the source QuickBooks report convention.
  const order = [...AGEING_BUCKETS].reverse();
  let r = 6;
  let grandAmount = 0, grandOpen = 0;
  for (const bucket of order) {
    const b = ageing.buckets[bucket];
    if (!b.invoices.length) continue;
    ws.getCell(r, 1).value = bucket; ws.getCell(r, 1).font = { bold: true, color: { argb: GREEN900 } }; r++;
    for (const inv of b.invoices) {
      txtCell(ws, r, 2, inv.txn_date); txtCell(ws, r, 3, inv.txn_type); txtCell(ws, r, 4, inv.number); txtCell(ws, r, 5, inv.po_number);
      txtCell(ws, r, 6, inv.customer_name_raw); txtCell(ws, r, 7, inv.due_date); moneyCell(ws, r, 8, inv.amount); moneyCell(ws, r, 9, inv.open_balance);
      txtCell(ws, r, 10, inv.pgs_raw); txtCell(ws, r, 11, inv.status);
      r++;
    }
    txtCell(ws, r, 1, `Total for ${bucket}`, { bold: true }); moneyCell(ws, r, 8, b.amount); moneyCell(ws, r, 9, b.open); totalRow(ws, r, 8, 9);
    grandAmount += b.amount; grandOpen += b.open;
    r += 1;
  }
  txtCell(ws, r, 1, 'TOTAL', { bold: true }); moneyCell(ws, r, 8, grandAmount); moneyCell(ws, r, 9, grandOpen); totalRow(ws, r, 8, 9);
  r += 2;
  ws.getCell(r, 1).value = `Generated ${new Date().toLocaleString('en-GB')}`;
  ws.getCell(r, 1).font = { italic: true, size: 8, color: { argb: 'FF96A09B' } };
}

/** Builds the full Master Analysis workbook and returns it as an ExcelJS Workbook (call .xlsx.writeBuffer()). */
export async function buildMasterAnalysisWorkbook(companyName, asOf, asOfDateForCalc, analysis) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AR Suite';
  addGVTvsPVT(wb, companyName, asOf, analysis);
  addGVTAnalysis(wb, companyName, asOf, analysis);
  addNoteSheet(wb, 'Note1.2', companyName, asOf, 'Note 1.2', 'Payment Pending from MOFT', analysis.note12);
  addNoteSheet(wb, 'Note1.3', companyName, asOf, 'Note 1.3', 'Invoices Pending Submit to MOFT', analysis.note13);
  addSectorAnalysis(wb, 'PVT Analysis 2.1', companyName, asOf, 'PVT', 'Note 2.2', analysis.pvtCustomers, null);
  addNoteSheet(wb, 'Note2.2', companyName, asOf, 'Note 2.2', 'PVT Outstanding Balance — Customer-wise', analysis.note22);
  addSectorAnalysis(wb, 'Semi-GVT Analysis 2.3', companyName, asOf, 'Semi-GVT', 'Note 2.4', analysis.semiCustomers, analysis.semiPaidDetails);
  addNoteSheet(wb, 'Note2.4', companyName, asOf, 'Note 2.4', 'Semi-GVT Outstanding Balance — Customer-wise', analysis.note24);
  addAgeingSheet(wb, companyName, asOf, analysis.invoices, asOfDateForCalc);
  return wb;
}
