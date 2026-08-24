import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const rows = user.role === 'admin'
    ? await sql`select * from companies order by code`
    : await sql`
        select c.* from companies c
        join user_company_access a on a.company_id = c.id
        where a.user_id = ${user.id}
        order by c.code
      `;
  return Response.json(rows);
}
