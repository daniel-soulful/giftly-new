// src/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// service imports
import { signup, login /*, requireAuth */ } from './services/auth.js';
import { ideasFor } from './services/ideas.js';
// import other routes like people, orders if you have them
// import { listPeople, createPerson, editPerson } from './services/people.js';

dotenv.config();

// ======================
// Tiny auto-migrate: create DB & tables if missing
// ======================
const DB_PATH = process.env.DB_PATH || '/data/giftly.db';
const _dir = path.dirname(DB_PATH);
if (!fs.existsSync(_dir)) fs.mkdirSync(_dir, { recursive: true });

const _mdb = new Database(DB_PATH);
_mdb.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  country TEXT,
  address TEXT,
  dob TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  birthdate TEXT NOT NULL,
  gender TEXT,
  budget INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  person_id INTEGER,
  product_id TEXT,
  product_name TEXT,
  price_paid_nok INTEGER,
  status TEXT DEFAULT 'placed',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(person_id) REFERENCES people(id)
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price_nok INTEGER,
  merchant_name TEXT,
  tags TEXT
);
`);
_mdb.close();

// ======================
// Express app
// ======================
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth
app.post('/auth/signup', signup);
app.post('/auth/login', login);

// Ideas
app.get('/ideas', ideasFor);

// People routes (uncomment + import if you have them)
// app.get('/people', requireAuth, listPeople);
// app.post('/people', requireAuth, createPerson);
// app.put('/people/:id', requireAuth, editPerson);

// Orders routes (if implemented)
// app.get('/orders', requireAuth, listOrders);
// app.post('/orders', requireAuth, placeOrder);

// ======================
// Start server
// ======================
const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`[giftly] API up on :${PORT}`));
