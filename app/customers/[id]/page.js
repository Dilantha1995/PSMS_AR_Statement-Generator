import { sql } from '@/lib/db';
import { getCurrentCompany, getCurrentUser } from '@/lib/session';
import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const OUTCOMES = [
  ['promised_date', 'Promised a date'],
  ['paid', 'Paid'],
  ['partial_payment', 'Partial payment'],
  ['disputed', 'Disputed'],
  ['no_response', 'No response'],
  ['other', 'Other'],
];

async function addFollowup(formData) {
  'use server';
  const company = await getCurrentCompany();
  const user = await getCurrentUser();
  const outcome = formData.get('outcome');
  await sql`
    insert into followups (company_id, customer_id, followup_date, note, outcome, promised_date, amount_discussed, next_action_date, logged_by)
    values (
      ${company.id}, ${formData.get('customer_id')}, ${formData.get('followup_date') || new Date().toISOString().slice(0,10)},
      ${formData.get('note')}, ${outcome},
      ${outcome === 'promised_date' ? formData.get('promised_date') || null : null},
      ${formData.get('amount_discussed') || null}, ${formData.get('next_action_date') || null}, ${user.id}
    )
  `;
  revalidatePath(`/customers/${formData.get('customer_id')}`);
}

async function addContact(formData) {
  'use server';
  const customerId = formData.get('customer_id');
  if (formData.get('is_primary')) await sql`update customer_contacts set is_primary=false where customer_id=${customerId}`;
  await sql`
    insert into customer_contacts (customer_id, contact_name, role, phone, email, is_primary)
    values (${customerId}, ${formData.get('contact_name')}, ${formData.get('role')}, ${formData.get('phone')}, ${formData.get('email')}, ${!!formData.get('is_primary')})
  `;
  revalidatePath(`/customers/${customerId}`);
}

async function addAddress(formData) {
  'use server';
  const customerId = formData.get('customer_id');
  if (formData.get('is_primary')) await sql`update customer_addresses set is_primary=false where customer_id=${customerId}`;
  await sql`
    insert into customer_addresses (customer_id, label, address_line, island, atoll, is_primary)
    values (${customerId}, ${formData.get('label')}, ${formData.get('address_line')}, ${formData.get('island')}, ${formData.get('atoll')}, ${!!formData.get('is_primary')})
  `;
  revalidatePath(`/customers/${customerId}`);
}

export default async function CustomerDetailPage({ params }) {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');

  const [customer] = await sql`select * from customers where id=${params.id} and company_id=${company.id}`;
  if (!customer) notFound();

  const [contacts, addresses, followups, latestBalance] = await Promise.all([
    sql`select * from customer_contacts where customer_id=${params.id} order by is_primary desc, created_at`,
    sql`select * from customer_addresses where customer_id=${params.id} order by is_primary desc, created_at`,
    sql`select f.*, u.full_name as logged_by_name from followups f
        left join app_users u on u.id=f.logged_by
        where f.customer_id=${params.id} order by f.followup_date desc, f.created_at desc limit 30`,
    sql`select coalesce(sum(open_balance),0) as bal from ar_invoices i
        where i.customer_id=${params.id}
          and i.snapshot_id=(select id from ar_snapshots s where s.company_id=${company.id} order by s.uploaded_at desc limit 1)`,
  ]);

  return (
    <div>
      <h2>{customer.name} <span className={`badge ${customer.type}`}>{customer.type}</span></h2>
      <p style={{ color: 'var(--ink-500)' }}>Latest open balance: <strong>{Number(latestBalance[0].bal).toLocaleString(undefined,{minimumFractionDigits:2})}</strong></p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h4>Contacts</h4>
          <ul>{contacts.map((c) => (
            <li key={c.id}>{c.contact_name} {c.role && `— ${c.role}`} {c.phone && `· ${c.phone}`} {c.email && `· ${c.email}`} {c.is_primary && '★'}</li>
          ))}</ul>
          <details><summary style={{ cursor: 'pointer' }}>+ Add contact</summary>
            <form action={addContact} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <input name="contact_name" placeholder="Name" />
              <input name="role" placeholder="Role (e.g. Finance Officer)" />
              <input name="phone" placeholder="Phone" />
              <input name="email" placeholder="Email" />
              <label><input type="checkbox" name="is_primary" /> Primary contact</label>
              <button type="submit">Save contact</button>
            </form>
          </details>
        </div>

        <div className="card">
          <h4>Addresses</h4>
          <ul>{addresses.map((a) => (
            <li key={a.id}>{a.label && `${a.label}: `}{a.address_line} {a.island} {a.atoll} {a.is_primary && '★'}</li>
          ))}</ul>
          <details><summary style={{ cursor: 'pointer' }}>+ Add address</summary>
            <form action={addAddress} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <input name="label" placeholder="Label (Head Office, Billing...)" />
              <input name="address_line" placeholder="Address" />
              <input name="island" placeholder="Island" />
              <input name="atoll" placeholder="Atoll" />
              <label><input type="checkbox" name="is_primary" /> Primary address</label>
              <button type="submit">Save address</button>
            </form>
          </details>
        </div>
      </div>

      <div className="card">
        <h4>Log a follow-up</h4>
        <form action={addFollowup} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
          <input type="hidden" name="customer_id" value={customer.id} />
          <input type="date" name="followup_date" defaultValue={new Date().toISOString().slice(0,10)} />
          <select name="outcome" required>
            {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" name="promised_date" placeholder="Promised date (if applicable)" />
          <input type="number" step="0.01" name="amount_discussed" placeholder="Amount discussed" style={{ width: 140 }} />
          <input type="date" name="next_action_date" placeholder="Next action date" />
          <textarea name="note" placeholder="What happened on this call/visit…" required style={{ flexBasis: '100%' }} rows={2} />
          <button type="submit">Log follow-up</button>
        </form>
      </div>

      <div className="card">
        <h4>Follow-up history</h4>
        <table>
          <thead><tr><th>Date</th><th>Outcome</th><th>Note</th><th>Next action</th><th>By</th></tr></thead>
          <tbody>
            {followups.map((f) => (
              <tr key={f.id}>
                <td>{f.followup_date}</td>
                <td>{OUTCOMES.find(([v]) => v === f.outcome)?.[1] || f.outcome}{f.promised_date ? ` (${f.promised_date})` : ''}</td>
                <td>{f.note}</td>
                <td>{f.next_action_date || '—'}</td>
                <td>{f.logged_by_name || '—'}</td>
              </tr>
            ))}
            {!followups.length && <tr><td colSpan={5}>No follow-ups logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
