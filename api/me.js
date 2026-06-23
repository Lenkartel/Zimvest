// api/me.js — ZimVest
// Reads zimvest_session JWT cookie and returns the logged-in user.
// Called on login.html load to detect a returning session.

import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-vercel-env');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const token = parseCookies(req.headers.cookie)['zimvest_session'];
  if (!token) return res.status(401).json({ error: 'No session' });
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return res.status(200).json({ phone: payload.phone, name: payload.name });
  } catch {
    res.setHeader('Set-Cookie', 'zimvest_session=; Path=/; HttpOnly; Max-Age=0');
    return res.status(401).json({ error: 'Session expired' });
  }
}
