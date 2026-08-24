import { neon } from '@neondatabase/serverless';

// DATABASE_URL is set as a Vercel env var pointing at the Neon project created for this app.
// Using the tagged-template query form gives us parameterized queries for free (no manual escaping).
export const sql = neon(process.env.DATABASE_URL);

/**
 * Small helper so route handlers can do:
 *   const rows = await q`select * from customers where company_id = ${companyId}`;
 * and get plain JS objects back.
 */
export async function q(strings, ...values) {
  return sql(strings, ...values);
}
