// src/services/auth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { get, run } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export async function signup(req, res) {
  try {
    const { fullName, email, password, country, address, dob } = req.body || {};
    if (!fullName || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }
    const exists = get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) return res.status(409).json({ ok: false, error: 'Email already in use' });

    const password_hash = await bcrypt.hash(password, 10);
    const info = run(
      'INSERT INTO users (full_name, email, password_hash, country, address, dob) VALUES (?,?,?,?,?,?)',
      [fullName, email, password_hash, country || null, address || null, dob || null]
    );
    const user = { id: info.lastInsertRowid, fullName, email };
    const token = jwt.sign({ uid: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Missing email/password' });

    const row = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!row) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    const user = { id: row.id, fullName: row.full_name, email: row.email };
    const token = jwt.sign({ uid: row.id, email: row.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

// simple middleware if you need it
export function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Invalid token' });
  }
}
