'use client';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const BRAND = { r: 26, g: 107, b: 79 };

export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function safeFile(s) { return String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, ''); }
function todayLabel() { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; }

/** kind: 'pending_moft' | 'pending_payment' | 'combined' | 'soa' — mirrors statementMeta() in V5. */
export function statementMeta(customerName, kind, allInvoices) {
  const dateStr = todayLabel().replace(/-/g, '_');
  const safe = safeFile(customerName);
  const pendingMoft = allInvoices.filter((i) => i.status_class === 'pending_moft');
  const pendingPayment = allInvoices.filter((i) => i.status_class === 'pending_payment');
  switch (kind) {
    case 'pending_moft': return { title: 'List of Invoice Pending to Submit to Ministry of Finance', invoices: pendingMoft, filename: `${safe}_Pending_to_Submit_to_MOFT_${dateStr}` };
    case 'pending_payment': return { title: 'List of Invoice Pending Payment from Ministry of Finance', invoices: pendingPayment, filename: `${safe}_Pending_Payment_from_MOFT_${dateStr}` };
    default: return { title: 'Statement of Account', invoices: allInvoices, filename: `${safe}_SOA_${dateStr}` };
  }
}

export function buildCustomerPdf({ companyName, reportDate, customerName, kind, invoices, preparedBy }) {
  const meta = statementMeta(customerName, kind, invoices);
  const rows = meta.invoices;
  const totalAmount = rows.reduce((s, x) => s + Number(x.amount), 0);
  const totalOpen = rows.reduce((s, x) => s + Number(x.open_balance), 0);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth(), margin = 36;
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b); doc.circle(margin + 12, 40, 12, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('AR', margin + 12, 44, { align: 'center' });
  doc.setTextColor(15, 61, 46); doc.setFontSize(14); doc.text(companyName, margin + 32, 38);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(91, 108, 100); doc.text(meta.title, margin + 32, 53);
  doc.setFontSize(9); doc.text(`Customer: ${customerName}`, pageW - margin, 38, { align: 'right' });
  doc.text(`As of: ${reportDate || todayLabel()}`, pageW - margin, 51, { align: 'right' });
  const head = [['Date', 'Transaction type', 'Number', 'PO Number', 'Due date', 'Amount', 'Open balance', 'Status of Payment']];
  const body = rows.map((inv) => [inv.txn_date, inv.txn_type, inv.number, inv.po_number, inv.due_date, fmtMoney(inv.amount), fmtMoney(inv.open_balance), inv.status]);
  body.push(['', '', '', '', 'Total', fmtMoney(totalAmount), fmtMoney(totalOpen), '']);
  doc.autoTable({ startY: 70, margin: { left: margin, right: margin }, head, body, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b] },
    didParseCell: (data) => { if (data.row.index === body.length - 1) { data.cell.styles.fillColor = [230, 244, 238]; data.cell.styles.fontStyle = 'bold'; } },
    didDrawPage: () => { const pageH = doc.internal.pageSize.getHeight(); doc.setFontSize(8); doc.setTextColor(150, 160, 155); doc.setFont('helvetica', 'normal'); doc.text(`Generated ${new Date().toLocaleString('en-GB')}  •  ${companyName}${preparedBy ? '  •  Prepared by: ' + preparedBy : ''}`, margin, pageH - 16); doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageW - margin, pageH - 16, { align: 'right' }); },
  });
  return { doc, filename: meta.filename };
}

export function buildCustomerXlsx({ companyName, reportDate, customerName, kind, invoices, preparedBy }) {
  const meta = statementMeta(customerName, kind, invoices);
  const rows = meta.invoices;
  const totalAmount = rows.reduce((s, x) => s + Number(x.amount), 0);
  const totalOpen = rows.reduce((s, x) => s + Number(x.open_balance), 0);
  const aoa = [[companyName], [meta.title], [`Customer Name: ${customerName}`], [`As of: ${reportDate || todayLabel()}`]];
  if (preparedBy) aoa.push([`Prepared by: ${preparedBy}`, '', '', '', '', '', '', '', '', `Date: ${todayLabel()}`]);
  aoa.push([]);
  aoa.push(['Date', 'Transaction type', 'Number', 'PO Number', 'Due date', 'Amount', 'Open balance', 'Status of Payment']);
  for (const inv of rows) aoa.push([inv.txn_date, inv.txn_type, inv.number, inv.po_number, inv.due_date, Number(inv.amount), Number(inv.open_balance), inv.status]);
  aoa.push(['', '', '', 'Total', '', totalAmount, totalOpen, '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 60 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Statement');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: meta.filename };
}
