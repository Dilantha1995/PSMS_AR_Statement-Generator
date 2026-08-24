const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  const sqlText = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('Applying db/schema.sql ...');
  await pool.query(sqlText);
  console.log('Schema applied.');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
