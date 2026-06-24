// api/me.js
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-prod');

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map(p => {
      const [k, ...v] = p.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = parseCookies(req.headers.cookie ?? '')['zimvest_session'];
  if (!token) return res.status(401).json({ error: 'No session' });

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return res.status(200).json({ phone: payload.phone, name: payload.name });
  } catch {
    res.setHeader('Set-Cookie', 'zimvest_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}
