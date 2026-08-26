import { sql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  await sql`update app_users set password_changed_at = now() where id = ${user.id}`;
  return Response.json({ ok: true });
}
