import { run } from './services/db.js';
import bcrypt from 'bcryptjs';

async function main(){
  // Only seed a demo user; products come from SerpAPI at runtime
  const pw = bcrypt.hashSync('test1234', 10);
  try {
    await run(
      `INSERT INTO users(full_name,email,password_hash,country,currency) VALUES (?,?,?,?,?)`,
      ['Demo User','demo@example.com',pw,'Norway','NOK']
    );
  } catch {}
  console.log('Seed complete (demo user only).');
}
main().catch(e=>{ console.error(e); process.exit(1); });