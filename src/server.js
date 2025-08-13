import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { signup, login, authRequired } from './services/auth.js';
import { listPeople, createPerson, getPerson, updatePerson, deletePerson } from './services/people.js';
import { listProducts, createOrder, listOrders } from './services/prods_orders.js';
import { ideasFor } from './services/ideas.js';

dotenv.config();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (req,res)=> res.json({ ok:true, time:new Date().toISOString() }));

// Auth
app.post('/auth/signup', signup);
app.post('/auth/login', login);

// Protected routes
app.get('/people', authRequired, listPeople);
app.post('/people', authRequired, createPerson);
app.get('/people/:id', authRequired, getPerson);
app.put('/people/:id', authRequired, updatePerson);
app.delete('/people/:id', authRequired, deletePerson);

app.get('/products', listProducts);
app.get('/ideas', ideasFor);
app.post('/orders', authRequired, createOrder);
app.get('/orders', authRequired, listOrders);

// Static last (frontend will be added in Batch #2)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req,res)=> res.sendFile(path.join(publicDir,'index.html')));

const PORT = process.env.PORT || 5173;
app.listen(PORT, ()=> console.log(`[giftify] API+App up on http://localhost:${PORT}`));