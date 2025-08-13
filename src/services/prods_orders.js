import { all, get, run } from './db.js';

export async function listProducts(req,res){
  const rows = await all(`SELECT * FROM products ORDER BY merchant_name, name`);
  res.json({ ok:true, products: rows });
}

export async function createOrder(req,res){
  const { personId, productId, qty } = req.body || {};
  // In SerpAPI mode there may be no local product; allow a simple record
  const prod = await get(`SELECT * FROM products WHERE id=?`,[productId]);
  const price = prod ? prod.price_nok*(qty||1) : 0;
  const r = await run(
    `INSERT INTO orders(user_id, person_id, product_id, qty, price_paid_nok, status)
     VALUES (?,?,?,?,?,?)`,
    [req.user.id, personId||null, productId, qty||1, price, 'paid']
  );
  res.json({ ok:true, id: r.lastID });
}

export async function listOrders(req,res){
  const rows = await all(
    `SELECT o.*, p.name AS product_name FROM orders o
     LEFT JOIN products p ON p.id=o.product_id
     WHERE o.user_id=? ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  res.json({ ok:true, orders: rows });
}