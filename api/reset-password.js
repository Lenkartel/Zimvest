// api/reset-password.js
// Saves a new bcrypt-hashed password for an existing account.
// Phone must have already been verified to exist via /api/reset-check.

import bcrypt from 'bcryptjs';

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { phone, password } = body;

  if (!phone || !/^\+263[0-9]{9}$/.test(phone))
    return res.status(400).json({ error: 'Invalid EcoCash number.' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable. Please try again shortly.' });

  // Fetch existing user record
  const raw = await kv.get(`user:${phone}`).catch(() => null);
  if (!raw)
    return res.status(404).json({ error: 'Account not found. Please register first.' });

  let user;
  try { user = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return res.status(500).json({ error: 'Account data error. Please contact support.' }); }

  // Hash new password and persist — preserve all other fields
  const hash = await bcrypt.hash(password, 10);
  const updated = { ...user, hash, updatedAt: new Date().toISOString() };
  await kv.set(`user:${phone}`, JSON.stringify(updated));

  return res.status(200).json({ ok: true });
}
