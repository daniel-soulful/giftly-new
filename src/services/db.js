import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'giftify.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new sqlite3.Database(dbPath);

export function run(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err){
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
export function all(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function(err, rows){
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
export function get(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function(err, row){
      if (err) reject(err);
      else resolve(row);
    });
  });
}