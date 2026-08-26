import { getCurrentUser, getCurrentCompany } from '@/lib/session';
import Link from 'next/link';
import './globals.css';

export const metadata = { title: 'AR Suite' };

export default async function RootLayout({ children }) {
  const user = await getCurrentUser().catch(() => null);
  const company = await getCurrentCompany().catch(() => null);

  return (
    <html lang="en">
      <body>
        {user && (
          <nav className="topnav">
            <div className="topnav-left">
              <Link href="/dashboard" className="brand">AR Suite</Link>
              {company && <span className="company-pill">{company.code}</span>}
              {company && (
                <>
                  <Link href="/dashboard">Dashboard</Link>
                  <Link href="/customers">Customers</Link>
                  <Link href="/soa">SOA Generator</Link>
                  <Link href="/followups/report">Follow-up Report</Link>
                  {user.role === 'admin' && <Link href="/admin/users">Users</Link>}
                  <Link href="/select-company">Switch company</Link>
                </>
              )}
            </div>
            <div className="topnav-right">
              <span>{user.full_name}</span>
              <form action="/api/auth/sign-out" method="post"><button type="submit">Sign out</button></form>
            </div>
          </nav>
        )}
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
