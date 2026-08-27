/** Formats a Postgres 'date' value (which may arrive as a Date object or a string) as YYYY-MM-DD text. */
export function fmtDate(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
