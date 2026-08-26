'use client';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

const BRAND = { r: 26, g: 107, b: 79 };
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;

export function buildDashboardPdf({ companyName, reportDate, analysis }) {
  const { sectors: s, gvtCustomers, pvtCustomers, semiCustomers } = analysis;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 36;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 61, 46);
  doc.text(`AR ${companyName}`, margin, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(91, 108, 100);
  doc.text('A/R Analysis — GVT vs PVT Summary', margin, 56);
  doc.setFontSize(9);
  doc.text(`As of: ${reportDate}`, doc.internal.pageSize.getWidth() - margin, 40, { align: 'right' });

  doc.autoTable({
    startY: 70, margin: { left: margin, right: margin }, theme: 'grid',
    head: [['Sector', 'Total Outstanding - QB', '%', 'Paid & Details Pending', 'Net Outstanding']],
    body: [
      ['GVT', fmt(s.gvt.qb), pct(s.gvt.pct), fmt(s.gvt.paid), fmt(s.gvt.net)],
      ['PVT', fmt(s.pvt.qb), pct(s.pvt.pct), fmt(s.pvt.paid), fmt(s.pvt.net)],
      ['Semi-GVT', fmt(s.semi.qb), pct(s.semi.pct), fmt(s.semi.paid), fmt(s.semi.net)],
      [{ content: 'Total', styles: { fontStyle: 'bold' } }, { content: fmt(s.total.qb), styles: { fontStyle: 'bold' } }, '', { content: fmt(s.total.paid), styles: { fontStyle: 'bold' } }, { content: fmt(s.total.net), styles: { fontStyle: 'bold' } }],
    ],
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 61, 46);
  doc.text('GVT — Customer-wise MOFT Analysis', margin, doc.lastAutoTable.finalY + 24);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 30, margin: { left: margin, right: margin }, theme: 'grid',
    head: [['#', 'Customer', 'Not Submitted\nto MOFT', '%', 'Payment Pending\nfrom MOFT', '%', 'Paid &\nPending', 'Total\nOutstanding']],
    body: [
      ...gvtCustomers.map((c, i) => [i + 1, c.name, fmt(c.submit), pct(c.submitPct), fmt(c.pay), pct(c.payPct), fmt(c.paid), fmt(c.gross)]),
      [{ content: 'Total', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: fmt(gvtCustomers.reduce((s, x) => s + x.submit, 0)), styles: { fontStyle: 'bold' } }, '', { content: fmt(gvtCustomers.reduce((s, x) => s + x.pay, 0)), styles: { fontStyle: 'bold' } }, '', { content: fmt(gvtCustomers.reduce((s, x) => s + x.paid, 0)), styles: { fontStyle: 'bold' } }, { content: fmt(gvtCustomers.reduce((s, x) => s + x.gross, 0)), styles: { fontStyle: 'bold' } }],
    ],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [10, 95, 168], fontSize: 8 },
    columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right' }, 3: { halign: 'right', cellWidth: 34 }, 4: { halign: 'right' }, 5: { halign: 'right', cellWidth: 34 }, 6: { halign: 'right' }, 7: { halign: 'right' } },
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 61, 46);
  doc.text('PVT — Customer-wise Analysis', margin, doc.lastAutoTable.finalY + 24);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 30, margin: { left: margin, right: margin }, theme: 'grid',
    head: [['#', 'Customer', 'Outstanding - QB', 'Paid & Pending', 'Net Outstanding']],
    body: [
      ...pvtCustomers.map((c, i) => [i + 1, c.name, fmt(c.qb), fmt(c.paid), fmt(c.net)]),
      [{ content: 'Total', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: fmt(pvtCustomers.reduce((s, x) => s + x.qb, 0)), styles: { fontStyle: 'bold' } }, { content: fmt(pvtCustomers.reduce((s, x) => s + x.paid, 0)), styles: { fontStyle: 'bold' } }, { content: fmt(pvtCustomers.reduce((s, x) => s + x.net, 0)), styles: { fontStyle: 'bold' } }],
    ],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [42, 157, 111], fontSize: 8 },
    columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 61, 46);
  doc.text('Semi-GVT — Customer-wise Analysis', margin, doc.lastAutoTable.finalY + 24);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 30, margin: { left: margin, right: margin }, theme: 'grid',
    head: [['#', 'Customer', 'Outstanding - QB', 'Paid & Pending', 'Net Outstanding']],
    body: [
      ...semiCustomers.map((c, i) => [i + 1, c.name, fmt(c.qb), fmt(c.paid), fmt(c.net)]),
      [{ content: 'Total', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: fmt(semiCustomers.reduce((s, x) => s + x.qb, 0)), styles: { fontStyle: 'bold' } }, { content: fmt(semiCustomers.reduce((s, x) => s + x.paid, 0)), styles: { fontStyle: 'bold' } }, { content: fmt(semiCustomers.reduce((s, x) => s + x.net, 0)), styles: { fontStyle: 'bold' } }],
    ],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [98, 49, 168], fontSize: 8 },
    columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  const pageH = doc.internal.pageSize.getHeight(), pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(8); doc.setTextColor(150, 160, 155); doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${new Date().toLocaleString('en-GB')}  •  ${companyName}`, margin, pageH - 16);

  return { doc, filename: `AR_Dashboard_${companyName.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}` };
}

export function buildDashboardXlsx({ companyName, reportDate, analysis }) {
  const { sectors: s, gvtCustomers, pvtCustomers, semiCustomers } = analysis;
  const aoa = [
    [`AR ${companyName}`], ['A/R Analysis — GVT vs PVT Summary'], [`As of: ${reportDate}`], [],
    ['Sector', 'Total Outstanding - QB', '%', 'Paid & Details Pending', 'Net Outstanding'],
    ['GVT', s.gvt.qb, s.gvt.pct, s.gvt.paid, s.gvt.net],
    ['PVT', s.pvt.qb, s.pvt.pct, s.pvt.paid, s.pvt.net],
    ['Semi-GVT', s.semi.qb, s.semi.pct, s.semi.paid, s.semi.net],
    ['Total', s.total.qb, '', s.total.paid, s.total.net],
    [],
    ['GVT — Customer-wise MOFT Analysis'],
    ['#', 'Customer', 'Not Submitted to MOFT', '%', 'Payment Pending from MOFT', '%', 'Paid & Pending', 'Total Outstanding'],
    ...gvtCustomers.map((c, i) => [i + 1, c.name, c.submit, c.submitPct, c.pay, c.payPct, c.paid, c.gross]),
    ['', 'Total', gvtCustomers.reduce((s, x) => s + x.submit, 0), '', gvtCustomers.reduce((s, x) => s + x.pay, 0), '', gvtCustomers.reduce((s, x) => s + x.paid, 0), gvtCustomers.reduce((s, x) => s + x.gross, 0)],
    [],
    ['PVT — Customer-wise Analysis'],
    ['#', 'Customer', 'Outstanding - QB', 'Paid & Pending', 'Net Outstanding'],
    ...pvtCustomers.map((c, i) => [i + 1, c.name, c.qb, c.paid, c.net]),
    ['', 'Total', pvtCustomers.reduce((s, x) => s + x.qb, 0), pvtCustomers.reduce((s, x) => s + x.paid, 0), pvtCustomers.reduce((s, x) => s + x.net, 0)],
    [],
    ['Semi-GVT — Customer-wise Analysis'],
    ['#', 'Customer', 'Outstanding - QB', 'Paid & Pending', 'Net Outstanding'],
    ...semiCustomers.map((c, i) => [i + 1, c.name, c.qb, c.paid, c.net]),
    ['', 'Total', semiCustomers.reduce((s, x) => s + x.qb, 0), semiCustomers.reduce((s, x) => s + x.paid, 0), semiCustomers.reduce((s, x) => s + x.net, 0)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 34 }, { wch: 18 }, { wch: 8 }, { wch: 20 }, { wch: 8 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'AR Analysis');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: `AR_Dashboard_${companyName.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}` };
}
