import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

const COMPANY_COOKIE = 'ar_company_id';

/** Current logged-in app user (or null). Throws nothing — callers decide what to do. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) return null;
  const rows = await sql`
    select * from app_users where auth_user_id = ${session.user.id} limit 1
  `;
  return rows[0] || null;
}

/** The company the user picked on the "select company" screen (PPM / PSMS). */
export async function getCurrentCompany() {
  const companyId = cookies().get(COMPANY_COOKIE)?.value;
  if (!companyId) return null;
  const rows = await sql`select * from companies where id = ${companyId} limit 1`;
  return rows[0] || null;
}

export function setCompanyCookie(companyId) {
  cookies().set(COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Convenience guard for API routes: returns {user, company} or a 401/400 response. */
export async function requireUserAndCompany() {
  const user = await getCurrentUser();
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) };
  const company = await getCurrentCompany();
  if (!company) return { error: new Response('No company selected', { status: 400 }) };
  const access = await sql`
    select 1 from user_company_access where user_id = ${user.id} and company_id = ${company.id}
  `;
  if (!access.length && user.role !== 'admin') {
    return { error: new Response('Forbidden for this company', { status: 403 }) };
  }
  return { user, company };
}
