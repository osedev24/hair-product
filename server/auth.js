import bcrypt from 'bcryptjs';
import { query } from './db.js';
export function requireAdmin(req, res, next) { if (!req.session?.adminId) return res.status(401).json({ error: 'Admin sign-in required' }); next(); }
export async function login(req, res) {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const { rows } = await query('SELECT id,email,password_hash FROM admins WHERE email=$1', [String(email).toLowerCase().trim()]);
  if (!rows[0] || !(await bcrypt.compare(String(password), rows[0].password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  req.session.adminId = rows[0].id; req.session.adminEmail = rows[0].email;
  res.json({ admin: { email: rows[0].email } });
}
export async function logout(req,res) { req.session.destroy(() => { res.clearCookie('botanical.sid'); res.json({ ok: true }); }); }
export async function current(req,res) { res.json({ admin: req.session?.adminId ? { email: req.session.adminEmail } : null }); }
