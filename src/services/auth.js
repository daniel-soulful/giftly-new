import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { get, run } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export function authRequired(req,res,next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if(!token) return res.status(401).json({ ok:false, error:'missing token' });
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub };
    return next();
  }catch(e){
    return res.status(401).json({ ok:false, error:'invalid token' });
  }
}

export async function signup(req,res){
  const { fullName, email, password, address, city, country, postalCode } = req.body || {};
  if(!email || !password || !fullName) return res.status(400).json({ ok:false, error:'missing fields' });
  const hash = bcrypt.hashSync(password, 10);
  try{
    await run(
      `INSERT INTO users(full_name,email,password_hash,address_line,city,country,postal_code,currency)
       VALUES (?,?,?,?,?,?,?,?)`,
      [fullName,email,hash,address||'',city||'',country||'Norway',postalCode||'',country==='Norway'?'NOK':'USD']
    );
    return login(req,res);
  }catch(e){
    return res.status(400).json({ ok:false, error:'email in use' });
  }
}

export async function login(req,res){
  const { email, password } = req.body || {};
  const row = await get(`SELECT * FROM users WHERE email=?`,[email]);
  if(!row) return res.status(401).json({ ok:false, error:'invalid credentials' });
  if(!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ ok:false, error:'invalid credentials' });
  const token = jwt.sign({ sub: row.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ ok:true, token, user: { id: row.id, fullName: row.full_name, email: row.email, currency: row.currency } });
}