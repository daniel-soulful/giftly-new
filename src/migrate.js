import { run } from './services/db.js';

async function main(){
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    address_line TEXT,
    city TEXT,
    country TEXT,
    postal_code TEXT,
    currency TEXT DEFAULT 'NOK',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  await run(`CREATE TABLE IF NOT EXISTS persons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    birthdate TEXT NOT NULL,
    gender TEXT,
    budget INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  await run(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_nok INTEGER NOT NULL,
    image_url TEXT,
    merchant_name TEXT,
    tags TEXT
  );`);

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    person_id INTEGER,
    product_id TEXT NOT NULL,
    qty INTEGER DEFAULT 1,
    price_paid_nok INTEGER NOT NULL,
    status TEXT DEFAULT 'paid',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);

  console.log('Migrations complete.');
}
main().catch(e=>{ console.error(e); process.exit(1); });