import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { createUserAccount, resetUserPassword } from '@/lib/accounts';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

async function addUser(formData) {
  'use server';
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') throw new Error('Forbidden');

  const companyIds = formData.getAll('companyIds');
  let result;
  try {
    result = await createUserAccount({
      email: formData.get('email'),
      fullName: formData.get('fullName'),
      role: formData.get('role') || 'staff',
      companyIds,
    });
  } catch (e) {
    redirect(`/admin/users?error=${encodeURIComponent(e.message)}`);
  }
  revalidatePath('/admin/users');
  redirect(`/admin/users?created=${encodeURIComponent(formData.get('email'))}&tempPassword=${encodeURIComponent(result.tempPassword)}`);
}

async function resetPassword(formData) {
  'use server';
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') throw new Error('Forbidden');
  const appUserId = formData.get('appUserId');
  const email = formData.get('email');
  const { tempPassword } = await resetUserPassword(appUserId);
  revalidatePath('/admin/users');
  redirect(`/admin/users?created=${encodeURIComponent(email)}&tempPassword=${encodeURIComponent(tempPassword)}`);
}

export default async function AdminUsersPage({ searchParams }) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (me.role !== 'admin') return <div><h2>Admin only</h2><p>Your account doesn't have admin access.</p></div>;

  const [users, companies] = await Promise.all([
    sql`
      select u.*, array_remove(array_agg(c.code order by c.code), null) as company_codes
      from app_users u
      left join user_company_access a on a.user_id = u.id
      left join companies c on c.id = a.company_id
      group by u.id order by u.full_name
    `,
    sql`select * from companies order by code`,
  ]);

  return (
    <div>
      <h2>User Management</h2>

      {searchParams?.created && (
        <div className="card" style={{ borderColor: 'var(--green-500)', background: 'var(--green-50)' }}>
          <strong>Account ready for {searchParams.created}</strong>
          <p>Temporary password (shown once — share it securely, they should change it after first login):</p>
          <code style={{ fontSize: 16, background: '#fff', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>{searchParams.tempPassword}</code>
        </div>
      )}
      {searchParams?.error && <div className="card" style={{ borderColor: 'var(--amber)' }}><strong>Couldn't create user:</strong> {searchParams.error}</div>}

      <div className="card">
        <h4>Add a user</h4>
        <form action={addUser} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label>Full name<br /><input name="fullName" required /></label>
          <label>Email<br /><input type="email" name="email" required /></label>
          <label>Role<br />
            <select name="role" defaultValue="staff">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <fieldset style={{ border: '1px solid var(--ink-100)', borderRadius: 8, padding: '6px 10px' }}>
            <legend style={{ fontSize: 12 }}>Company access</legend>
            {companies.map((c) => (
              <label key={c.id} style={{ marginRight: 10 }}>
                <input type="checkbox" name="companyIds" value={c.id} /> {c.code}
              </label>
            ))}
          </fieldset>
          <button type="submit">Create user</button>
        </form>
      </div>

      <div className="table-scroll"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Companies</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.company_codes?.join(', ') || '—'}</td>
              <td>
                <form action={resetPassword}>
                  <input type="hidden" name="appUserId" value={u.id} />
                  <input type="hidden" name="email" value={u.email} />
                  <button type="submit" className="secondary">Reset password</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
