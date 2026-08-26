'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavBar({ fullName, companyCode, isAdmin, hasCompany }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = hasCompany ? [
    ['/dashboard', 'Dashboard'],
    ['/customers', 'Customers'],
    ['/soa', 'SOA Generator'],
    ['/documents', 'Documents'],
    ['/followups/report', 'Follow-up Report'],
    ...(isAdmin ? [['/admin/users', 'Users']] : []),
    ['/select-company', 'Switch company'],
  ] : [];

  return (
    <nav className="topnav">
      <div className="topnav-row">
        <div className="topnav-left">
          <Link href="/dashboard" className="brand" onClick={() => setOpen(false)}>AR Suite</Link>
          {companyCode && <span className="company-pill">{companyCode}</span>}
        </div>
        <div className="topnav-right">
          <span className="topnav-name">{fullName}</span>
          <button className="hamburger" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
            <span /><span /><span />
          </button>
        </div>
      </div>

      {links.length > 0 && (
        <div className={`topnav-links ${open ? 'open' : ''}`}>
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? 'active' : ''} onClick={() => setOpen(false)}>{label}</Link>
          ))}
          <form action="/api/auth/sign-out" method="post" className="signout-mobile">
            <button type="submit" className="secondary">Sign out</button>
          </form>
        </div>
      )}
    </nav>
  );
}
