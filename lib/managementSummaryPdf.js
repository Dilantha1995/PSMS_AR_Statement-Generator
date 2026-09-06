'use client';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const BRAND = { r: 26, g: 107, b: 79 };
const MAX_LETTERHEAD_H = 100; // points — caps a tall/full-page letterhead image down to a header-strip height
const TOP_MARGIN_WITH_HEADER = 40; // room reserved at the top of continuation pages for the mini repeated header
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;

function loadImageDims(base64, mime) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ dataUrl: `data:${mime};base64,${base64}`, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`Could not load image (${mime || 'unknown type'}) — it may not be a valid PNG/JPG.`));
    img.src = `data:${mime};base64,${base64}`;
  });
}

export async function buildManagementSummaryPdf(data) {
  const { companyName, reportDate, referenceNumber, generatedByName, logo, letterhead, sectors, buckets, critical, comparison, criticalDaysThreshold, narrative, aiGenerated } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 32, pageW = doc.internal.pageSize.getWidth();
  let y;

  let letterheadImg = null, logoImg = null;
  if (letterhead) {
    try { letterheadImg = await loadImageDims(letterhead.base64, letterhead.mime); }
    catch (e) { console.warn('Letterhead failed to load, falling back to plain header:', e.message); }
  }
  if (!letterheadImg && logo) {
    try { logoImg = await loadImageDims(logo.base64, logo.mime); }
    catch (e) { console.warn('Logo failed to load, falling back to plain header:', e.message); }
  }

  if (letterheadImg) {
    // The uploaded letterhead may be a full page (header + lots of blank space + a footer graphic),
    // not just a short banner. Cap its rendered height so it can never crowd out the report content —
    // it's scaled down as a whole (preserving its aspect ratio), not cropped, so nothing gets cut off oddly.
    const fullW = pageW - margin * 2;
    let w = fullW, h = (letterheadImg.h / letterheadImg.w) * w;
    if (h > MAX_LETTERHEAD_H) { h = MAX_LETTERHEAD_H; w = (letterheadImg.w / letterheadImg.h) * h; }
    const x = margin + (fullW - w) / 2;
    doc.addImage(letterheadImg.dataUrl, 'PNG', x, 16, w, h);
    y = 16 + h + 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 61, 46);
    doc.text('Management Summary Report — Accounts Receivable', margin, y);
    y += 14;
  } else {
    if (logoImg) {
      const logoH = 34, logoW = (logoImg.w / logoImg.h) * logoH;
      doc.addImage(logoImg.dataUrl, 'PNG', margin, 16, logoW, logoH);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 61, 46);
      doc.text(companyName, margin + logoW + 10, 38);
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 61, 46);
      doc.text(companyName, margin, 40);
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(91, 108, 100);
    doc.text('Management Summary Report — Accounts Receivable', margin, 56);
    y = 74;
  }

  const metaParts = [`As of: ${reportDate}`];
  if (referenceNumber) metaParts.push(`Ref: ${referenceNumber}`);
  metaParts.push(`Generated: ${new Date().toLocaleString('en-GB')}${generatedByName ? ` by ${generatedByName}` : ''}`);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80, 90, 86);
  doc.text(metaParts.join('   •   '), pageW - margin, y, { align: 'right' });
  y += 12;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(120, 130, 126);
  doc.text('All amounts stated in Maldivian Rufiyaa (MVR)', pageW - margin, y, { align: 'right' });
  y += 14;

  doc.setDrawColor(216, 224, 220); doc.line(margin, y, pageW - margin, y); y += 18;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 61, 46);
  doc.text('Executive Summary', margin, y);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 160, 155);
  doc.text(aiGenerated ? '(AI-generated)' : '(auto-generated from figures)', margin + 110, y);
  y += 14;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(30, 40, 36);
  const narrativeLines = doc.splitTextToSize(narrative, pageW - margin * 2);
  doc.text(narrativeLines, margin, y);
  y += narrativeLines.length * 12 + 16;

  // Reserve space at the top of any continuation page (created by autoTable pagination) for a
  // repeated mini-header, so multi-page reports never start a page cold with a big data table.
  const tableMargin = { left: margin, right: margin, top: TOP_MARGIN_WITH_HEADER };

  doc.autoTable({
    startY: y, margin: tableMargin, theme: 'grid',
    head: [['Sector', 'Total Outstanding - QB (MVR)', '%', 'Paid & Pending (MVR)', 'Net Outstanding (MVR)']],
    body: [
      ['GVT', fmt(sectors.gvt.qb), pct(sectors.gvt.pct), fmt(sectors.gvt.paid), fmt(sectors.gvt.net)],
      ['PVT', fmt(sectors.pvt.qb), pct(sectors.pvt.pct), fmt(sectors.pvt.paid), fmt(sectors.pvt.net)],
      ['Semi-GVT', fmt(sectors.semi.qb), pct(sectors.semi.pct), fmt(sectors.semi.paid), fmt(sectors.semi.net)],
      [{ content: 'Total', styles: { fontStyle: 'bold' } }, { content: fmt(sectors.total.qb), styles: { fontStyle: 'bold' } }, '', { content: fmt(sectors.total.paid), styles: { fontStyle: 'bold' } }, { content: fmt(sectors.total.net), styles: { fontStyle: 'bold' } }],
    ],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [BRAND.r, BRAND.g, BRAND.b], fontSize: 8.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 61, 46);
  doc.text('Ageing Analysis', margin, doc.lastAutoTable.finalY + 20);
  const bucketOrder = ['CURRENT', '1 - 30 days past due', '31 - 60 days past due', '61 - 90 days past due', '91 or more days past due'];
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 26, margin: tableMargin, theme: 'grid',
    head: [['Ageing Bucket', 'Invoice Count', 'Open Balance (MVR)']],
    body: bucketOrder.map((b) => [b, buckets[b]?.count || 0, fmt(buckets[b]?.open || 0)]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4 }, headStyles: { fillColor: [10, 95, 168], fontSize: 8.5 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(178, 40, 40);
  doc.text(`Critical Matters — overdue more than ${criticalDaysThreshold} days`, margin, doc.lastAutoTable.finalY + 20);
  if (critical.length) {
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 26, margin: tableMargin, theme: 'grid',
      head: [['Customer', 'Invoice #', 'Due Date', 'Days Overdue', 'Open Balance (MVR)']],
      body: critical.map((c) => [c.customer, c.invoice, c.dueDate, c.daysPastDue, fmt(c.openBalance)]),
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [178, 40, 40], fontSize: 7.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: (d) => { if (d.section === 'body') d.cell.styles.fillColor = [253, 240, 240]; },
    });
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    doc.text('No invoices currently overdue beyond this threshold.', margin, doc.lastAutoTable.finalY + 24);
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    if (p > 1) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 61, 46);
      doc.text(companyName, margin, 24);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(91, 108, 100);
      doc.text('Management Summary Report (continued)', margin, 34);
    }
    doc.setFontSize(7.5); doc.setTextColor(150, 160, 155); doc.setFont('helvetica', 'normal');
    doc.text(`${companyName}  •  Management Summary`, margin, pageH - 16);
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 16, { align: 'right' });
  }

  return { doc, filename: `Management_Summary_${companyName.replace(/[^a-z0-9]+/gi, '_')}_${(reportDate || '').replace(/[^a-z0-9]+/gi, '_')}` };
}
