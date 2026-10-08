import { buildManagementSummaryPdf } from './managementSummaryPdf';

/**
 * Builds the Management Summary Report PDF for a freshly uploaded snapshot,
 * saves it to Documents and downloads it. Runs in the browser after every
 * successful upload. Returns a status line for the UI.
 */
export async function generateManagementSummary(snapshotId) {
  try {
    const res = await fetch(`/api/snapshots/${snapshotId}/management-summary`);
    if (!res.ok) throw new Error('Could not build summary data.');
    const data = await res.json();
    const { doc, filename } = await buildManagementSummaryPdf(data);
    const base64 = doc.output('datauristring').split(',')[1];
    await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'management_summary', format: 'pdf', filename: `${filename}.pdf`, file_base64: base64, snapshot_id: snapshotId }),
    });
    doc.save(`${filename}.pdf`);
    return `Management Summary Report ready${data.aiGenerated ? ' (AI-generated)' : ''} — also saved to Documents.`;
  } catch (e) {
    return `Could not generate management summary: ${e.message}`;
  }
}
