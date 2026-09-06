'use client';
import { useState, useEffect } from 'react';

export default function ManagementSummaryLink({ snapshotId }) {
  const [doc, setDoc] = useState(undefined); // undefined = loading, null = none, object = found

  useEffect(() => {
    fetch(`/api/snapshots/${snapshotId}/management-summary-document`).then((r) => r.json()).then(setDoc).catch(() => setDoc(null));
  }, [snapshotId]);

  if (doc === undefined) return <span style={{ color: 'var(--ink-500)' }}>…</span>;
  if (!doc) return <span style={{ color: 'var(--ink-500)' }}>—</span>;
  return <a href={`/api/documents/${doc.id}/download`}>Download</a>;
}
