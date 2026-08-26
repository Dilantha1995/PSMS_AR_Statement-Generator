'use client';
import { useState } from 'react';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null); // { kind: 'error'|'success', text }
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setStatus(null);

    if (newPassword.length < 8) {
      setStatus({ kind: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ kind: 'error', text: "New password and confirmation don't match." });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setStatus({ kind: 'error', text: data?.message || 'Current password is incorrect, or the change was rejected.' });
        return;
      }
      // Record when it happened so admins can see it on the Users page.
      await fetch('/api/account/password-changed', { method: 'POST' }).catch(() => {});
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setStatus({ kind: 'success', text: 'Password updated.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h2>Change Password</h2>
      <form onSubmit={onSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label>Current password
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
        <label>New password
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        </label>
        <label>Confirm new password
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
        </label>
        {status && <p style={{ color: status.kind === 'error' ? 'var(--amber)' : 'var(--green-700)' }}>{status.text}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
      </form>
    </div>
  );
}
