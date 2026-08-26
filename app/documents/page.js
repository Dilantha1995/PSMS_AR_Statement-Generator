import { sql } from '@/lib/db';
import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';

const KIND_LABELS = {
  dashboard: 'Dashboard Report', pending_moft: 'Pending Submit to MOFT', pending_payment: 'Pending Payment from MOFT',
  combined: 'Combined SOA', soa: 'SOA',
};

export default async function DocumentsPage() {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const docs = await sql`
    select l.id, l.kind, l.format, l.filename, l.generated_at, c.name as customer_name, u.full_name as generated_by_name
    from statement_log l
    left join customers c on c.id = l.customer_id
    left join app_users u on u.id = l.generated_by
    where l.company_id = ${company.id}
    order by l.generated_at desc
    limit 200
  `;

  return (
    <div>
      <h2>Documents — {company.name}</h2>
      <p style={{ color: 'var(--ink-500)' }}>Every dashboard report and statement generated for {company.name}, always downloadable again.</p>
      <table>
        <thead><tr><th>Generated</th><th>Type</th><th>Customer</th><th>Format</th><th>By</th><th></th></tr></thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>{new Date(d.generated_at).toLocaleString()}</td>
              <td>{KIND_LABELS[d.kind] || d.kind}</td>
              <td>{d.customer_name || '—'}</td>
              <td>{d.format?.toUpperCase()}</td>
              <td>{d.generated_by_name || '—'}</td>
              <td><a href={`/api/documents/${d.id}/download`}>Download</a></td>
            </tr>
          ))}
          {!docs.length && <tr><td colSpan={6}>No documents generated yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
