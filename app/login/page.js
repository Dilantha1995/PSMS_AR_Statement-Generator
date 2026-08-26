'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // If a session already exists (e.g. a previous sign-in succeeded but this
  // page didn't get to redirect, or the tab was reopened), skip straight past.
  useEffect(() => {
    fetch('/api/auth/get-session')
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => { if (session?.user) router.replace('/select-company'); else setChecking(false); })
      .catch(() => setChecking(false));
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      if (res.status === 429) setErr('Too many attempts — please wait a minute and try again.');
      else setErr('Invalid email or password.');
      return;
    }
    router.push('/select-company');
  }

  if (checking) return null;

  return (
    <div style={{ maxWidth: 360, width: '100%', margin: '48px auto', padding: '0 16px' }}>
      <h2>AR Suite — Sign in</h2>
      <form onSubmit={onSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={{ color: 'var(--amber)' }}>{err}</p>}
        <button type="submit">Sign in</button>
      </form>
      <p style={{ color: 'var(--ink-500)', fontSize: 12 }}>Accounts are created by an admin — contact yours if you don't have one yet.</p>
    </div>
  );
}
