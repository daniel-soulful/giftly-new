// src/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// Route handlers
import { signup, login /*, requireAuth */ } from './services/auth.js';
import { ideasFor } from './services/ideas.js';
// If you have people/orders routes, import & mount them too:
// import { listPeople, createPerson, updatePerson } from './services/people.js';
// import { listOrders, placeOrder } from './services/orders.js';

dotenv.config();

// -----------------------------------------------------
// DB bootstrap: make sure the DB folder exists, then auto-migrate
// -----------------------------------------------------
const DB_PATH = process.env.DB_PATH || './data/giftly.db';
const dbDir = path.dirname(path.resolve(DB_PATH));
fs.mkdirSync(dbDir, { recursive: true });

const bootstrapDb = new Database(DB_PATH);
bootstrapDb.exec(`
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
bootstrapDb.close();

// -----------------------------------------------------
// Express app
// -----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// Static hosting for /public (so / serves your app)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Auth
app.post('/auth/signup', signup);
app.post('/auth/login', login);

// Ideas
app.get('/ideas', ideasFor);

// Example wiring for protected routes (uncomment if you use them):
// app.get('/people', requireAuth, listPeople);
// app.post('/people', requireAuth, createPerson);
// app.put('/people/:id', requireAuth, updatePerson);
// app.get('/orders', requireAuth, listOrders);
// app.post('/orders', requireAuth, placeOrder);

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`[giftly] API up on :${PORT} (DB: ${DB_PATH})`));
