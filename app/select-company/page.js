import { sql } from '@/lib/db';
import { getCurrentUser, setCompanyCookie } from '@/lib/session';
import { redirect } from 'next/navigation';

async function pickCompany(formData) {
  'use server';
  setCompanyCookie(formData.get('companyId'));
  redirect('/dashboard');
}

export default async function SelectCompanyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const companies = user.role === 'admin'
    ? await sql`select * from companies order by code`
    : await sql`
        select c.* from companies c
        join user_company_access a on a.company_id = c.id
        where a.user_id = ${user.id} order by c.code
      `;

  return (
    <div>
      <h2>Select a company</h2>
      <p style={{ color: 'var(--ink-500)' }}>Everything after this — customers, uploads, statements, follow-ups — is scoped to the company you pick here.</p>
      <div style={{ display: 'flex', gap: 16 }}>
        {companies.map((c) => (
          <form action={pickCompany} key={c.id}>
            <input type="hidden" name="companyId" value={c.id} />
            <button type="submit" className="card" style={{ cursor: 'pointer', minWidth: 220, textAlign: 'left', background: 'var(--surface)', color: 'inherit', border: '1.5px solid var(--ink-100)' }}>
              <div style={{ fontSize: 12, color: 'var(--green-700)', fontWeight: 700 }}>{c.code}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{c.name}</div>
            </button>
          </form>
        ))}
        {!companies.length && <p>No companies assigned to your account yet — ask an admin to grant access.</p>}
      </div>
    </div>
  );
}
