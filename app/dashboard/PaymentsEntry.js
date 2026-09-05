'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate } from '@/lib/format';

export default function PaymentsEntry({ snapshotId, customers }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/payments').then((r) => r.json()).then((d) => { setPayments(d); setLoading(false); });
  }, []);

  async function addPayment(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      snapshot_id: snapshotId, // kept only as provenance, not used to filter
      customer_id: form.customer_id.value,
      amount: form.amount.value,
      pay_date: form.pay_date.value,
      reference: form.reference.value,
    };
    const res = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      form.reset();
      const updated = await fetch('/api/payments').then((r) => r.json());
      setPayments(updated);
      router.refresh();
    }
  }

  async function removePayment(id) {
    await fetch(`/api/payments?id=${id}`, { method: 'DELETE' });
    setPayments(payments.filter((p) => p.id !== id));
    router.refresh();
  }

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="card">
      <h4>Payments &amp; Details Pending</h4>
      <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>
        This list carries forward automatically to every new report you upload — it only changes when you remove a settled payment
        or add a new one. Amounts here reduce "Total Outstanding" into "Net Outstanding" on the dashboard and exports.
      </p>
      <form onSubmit={addPayment} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>Customer<br />
          <select name="customer_id" required>
            <option value="">Select…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Amount<br /><input type="number" step="0.01" name="amount" required style={{ width: 120 }} /></label>
        <label>Date<br /><input type="date" name="pay_date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Reference<br /><input name="reference" placeholder="optional" /></label>
        <button type="submit">Add</button>
      </form>

      {!loading && payments.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Date</th><th>Customer</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.pay_date)}</td>
                <td>{p.customer_name}</td>
                <td>{p.reference || '—'}</td>
                <td style={{ textAlign: 'right' }}>{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td><button className="secondary" onClick={() => removePayment(p.id)}>Remove</button></td>
              </tr>
            ))}
            <tr className="total-row"><td colSpan={3}><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></td><td></td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
