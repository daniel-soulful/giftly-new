// src/services/db.js
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/data/giftly.db'; // Render persistent disk
const db = new Database(DB_PATH);

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
