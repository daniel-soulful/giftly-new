// src/services/db.js
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || './data/giftly.db';

// Ensure directory exists (works for relative or absolute paths)
const dir = path.resolve(path.dirname(DB_PATH));
fs.mkdirSync(dir, { recursive: true });

// Open SQLite
const db = new Database(DB_PATH);

// Tiny helpers
export function all(sql, params = []) {
  return db.prepare(sql).all(params);
}
export function get(sql, params = []) {
  return db.prepare(sql).get(params);
}
export function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

export default db;
