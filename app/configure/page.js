import { getCurrentUser, getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import ConfigureClient from './ConfigureClient';

export default async function ConfigurePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');
  if (user.role !== 'admin') return <div><h2>Admin only</h2><p>Your account doesn't have admin access.</p></div>;
  return <ConfigureClient />;
}
