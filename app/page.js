import { redirect } from 'next/navigation';
import { getCurrentUser, getCurrentCompany } from '@/lib/session';

export default async function RootPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect('/login');
  const company = await getCurrentCompany().catch(() => null);
  redirect(company ? '/dashboard' : '/select-company');
}
