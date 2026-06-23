// api/login.js — ZimVest
// Verifies phone + password against KV, issues JWT session cookie.

import { kv }       from '@vercel/kv';
import bcrypt       from 'bcryptjs';
import { SignJWT }  from 'jose';

const SECRET      = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-vercel-env');
const COOKIE_OPTS = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { phone, password } = body;
  if (!phone || !password)
    return res.status(400).json({ error: 'Phone and password are required.' });

  const raw = await kv.get(`user:${phone}`).catch(() => null);
  if (!raw)
    return res.status(401).json({ error: 'No account found for this number. Please register.' });

  let user;
  try { user = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return res.status(500).json({ error: 'Account data error. Contact support.' }); }

  const match = await bcrypt.compare(password, user.hash);
  if (!match)
    return res.status(401).json({ error: 'Incorrect password. Try again.' });

  const token = await new SignJWT({ phone: user.phone, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(SECRET);

  res.setHeader('Set-Cookie', `zimvest_session=${token}; ${COOKIE_OPTS}`);
  return res.status(200).json({ ok: true, phone: user.phone, name: user.name });
}
