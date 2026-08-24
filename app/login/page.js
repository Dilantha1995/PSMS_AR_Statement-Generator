'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) { setErr('Invalid email or password.'); return; }
    router.push('/select-company');
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto' }}>
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
