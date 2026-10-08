import { getCurrentCompany } from '@/lib/session';
import { redirect } from 'next/navigation';
import AutoUpdateClient from './AutoUpdateClient';

export default async function ArUpdatePage() {
  const company = await getCurrentCompany();
  if (!company) redirect('/select-company');
  return (
    <div>
      <h2>Auto Update AR — {company.name}</h2>
      <AutoUpdateClient />
    </div>
  );
}
