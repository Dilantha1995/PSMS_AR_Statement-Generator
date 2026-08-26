import { hashPassword } from '@better-auth/utils/password';
import { randomUUID, randomBytes } from 'crypto';
import { sql } from '@/lib/db';

function generateTempPassword() {
  return 'Ar' + randomBytes(4).toString('hex') + '!' + Math.floor(Math.random() * 9 + 1);
}

/**
 * Creates a full login for a new team member: Better Auth's own user/account rows
 * plus our app_users profile and company access grants. Returns the temporary
 * password in plaintext ONCE (it is never stored or retrievable again).
 */
export async function createUserAccount({ email, fullName, role = 'staff', companyIds = [] }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await sql`select id from app_users where email = ${normalizedEmail}`;
  if (existing.length) throw new Error('A user with this email already exists.');

  const userId = randomUUID();
  const accountId = randomUUID();
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await sql`insert into "user" (id, name, email, "emailVerified") values (${userId}, ${fullName}, ${normalizedEmail}, true)`;
  await sql`
    insert into "account" (id, "accountId", "providerId", issuer, "userId", password, "createdAt", "updatedAt")
    values (${accountId}, ${userId}, 'credential', 'local:credential', ${userId}, ${passwordHash}, now(), now())
  `;
  await sql`insert into app_users (auth_user_id, email, full_name, role) values (${userId}, ${normalizedEmail}, ${fullName}, ${role})`;
  const [appUser] = await sql`select id from app_users where auth_user_id = ${userId}`;
  for (const companyId of companyIds) {
    await sql`insert into user_company_access (user_id, company_id) values (${appUser.id}, ${companyId}) on conflict do nothing`;
  }

  return { tempPassword, userId };
}

/** Resets an existing user's password (admin-triggered, e.g. after a lockout). */
export async function resetUserPassword(appUserId) {
  const [user] = await sql`select auth_user_id from app_users where id = ${appUserId}`;
  if (!user) throw new Error('User not found.');
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await sql`update "account" set password = ${passwordHash}, "updatedAt" = now() where "userId" = ${user.auth_user_id} and "providerId" = 'credential'`;
  await sql`update app_users set password_changed_at = now() where id = ${appUserId}`;
  return { tempPassword };
}
