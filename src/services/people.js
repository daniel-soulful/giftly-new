import { all, get, run } from './db.js';

export async function listPeople(req,res){
  const rows = await all(`SELECT * FROM persons WHERE user_id=? ORDER BY name`,[req.user.id]);
  res.json({ ok:true, people: rows });
}
export async function createPerson(req,res){
  const { name, birthdate, gender, budget, notes } = req.body || {};
  if(!name || !birthdate) return res.status(400).json({ ok:false, error:'missing fields' });
  const r = await run(
    `INSERT INTO persons(user_id,name,birthdate,gender,budget,notes) VALUES (?,?,?,?,?,?)`,
    [req.user.id,name,birthdate,gender||'',budget||0,notes||'']
  );
  res.json({ ok:true, id: r.lastID });
}
export async function getPerson(req,res){
  const p = await get(`SELECT * FROM persons WHERE id=? AND user_id=?`,[req.params.id, req.user.id]);
  if(!p) return res.status(404).json({ ok:false, error:'not found' });
  const orders = await all(
    `SELECT o.*, pr.name AS product_name FROM orders o
     LEFT JOIN products pr ON pr.id=o.product_id
     WHERE o.user_id=? AND o.person_id=? ORDER BY o.created_at DESC`,
    [req.user.id, p.id]
  );
  res.json({ ok:true, person: p, orders });
}
export async function updatePerson(req,res){
  const { name, birthdate, gender, budget, notes } = req.body || {};
  await run(
    `UPDATE persons SET name=?, birthdate=?, gender=?, budget=?, notes=? WHERE id=? AND user_id=?`,
    [name,birthdate,gender||'',budget||0,notes||'',req.params.id,req.user.id]
  );
  res.json({ ok:true });
}
export async function deletePerson(req,res){
  await run(`DELETE FROM persons WHERE id=? AND user_id=?`,[req.params.id, req.user.id]);
  res.json({ ok:true });
}