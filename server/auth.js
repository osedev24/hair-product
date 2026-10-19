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
export async function changePassword(req,res) {
  const currentPassword=String(req.body?.currentPassword||''),newPassword=String(req.body?.newPassword||'');
  if(!currentPassword||newPassword.length<8||newPassword.length>200)return res.status(400).json({error:'Enter your current password and a new password between 8 and 200 characters'});
  const {rows}=await query('SELECT password_hash FROM admins WHERE id=$1',[req.session.adminId]);
  if(!rows[0]||!(await bcrypt.compare(currentPassword,rows[0].password_hash)))return res.status(401).json({error:'Current password is incorrect'});
  const passwordHash=await bcrypt.hash(newPassword,12);
  await query('UPDATE admins SET password_hash=$1 WHERE id=$2',[passwordHash,req.session.adminId]);
  res.json({ok:true});
}
export async function changeAdminEmail(req,res) {
  const currentPassword=String(req.body?.currentPassword||''),email=String(req.body?.email||'').trim().toLowerCase();
  if(!currentPassword||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter your current password and a valid email address'});
  const {rows}=await query('SELECT password_hash FROM admins WHERE id=$1',[req.session.adminId]);
  if(!rows[0]||!(await bcrypt.compare(currentPassword,rows[0].password_hash)))return res.status(401).json({error:'Current password is incorrect'});
  try{
    const updated=await query('UPDATE admins SET email=$1 WHERE id=$2 RETURNING email',[email,req.session.adminId]);
    req.session.adminEmail=updated.rows[0].email;
    res.json({admin:{email:updated.rows[0].email}});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'That admin email is already in use'});throw e;}
}
