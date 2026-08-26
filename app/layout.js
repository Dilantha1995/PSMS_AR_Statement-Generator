import { getCurrentUser, getCurrentCompany } from '@/lib/session';
import NavBar from './NavBar';
import './globals.css';

export const metadata = { title: 'AR Suite' };
export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default async function RootLayout({ children }) {
  const user = await getCurrentUser().catch(() => null);
  const company = await getCurrentCompany().catch(() => null);

  return (
    <html lang="en">
      <body>
        {user && (
          <NavBar
            fullName={user.full_name}
            companyCode={company?.code}
            isAdmin={user.role === 'admin'}
            hasCompany={!!company}
          />
        )}
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
