// api/register.js
import bcrypt      from 'bcryptjs';
import { SignJWT } from 'jose';

const SECRET      = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-prod');
const COOKIE_OPTS = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000';

// Lazy import so a missing KV binding returns a clean 503 instead of crashing
async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { phone, password, name } = body;

  if (!phone || !password || !name)
    return res.status(400).json({ error: 'Phone, password and name are required.' });
  if (!/^\+263[0-9]{9}$/.test(phone))
    return res.status(400).json({ error: 'Invalid EcoCash number. Expected +2637XXXXXXXX' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (name.trim().length < 2)
    return res.status(400).json({ error: 'Please enter your full name.' });

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable. Please contact support.' });

  const existing = await kv.get(`user:${phone}`).catch(() => null);
  if (existing)
    return res.status(409).json({ error: 'This number is already registered. Please sign in.' });

  const hash = await bcrypt.hash(password, 10);
  const user = { phone, name: name.trim(), hash, createdAt: new Date().toISOString() };
  await kv.set(`user:${phone}`, JSON.stringify(user));

  const token = await new SignJWT({ phone, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(SECRET);

  res.setHeader('Set-Cookie', `zimvest_session=${token}; ${COOKIE_OPTS}`);
  return res.status(200).json({ ok: true, phone, name: user.name });
}
