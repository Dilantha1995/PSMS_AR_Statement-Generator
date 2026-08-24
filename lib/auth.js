import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';

// Better Auth manages its own users/sessions/accounts tables in the same Neon
// database (created automatically on first run via `npx @better-auth/cli migrate`).
// app_users (in schema.sql) links to these by auth_user_id and adds company access.
export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    // Staff accounts are created by an admin (see /api/admin/users), not self-signup.
    disableSignUp: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days
  },
});
