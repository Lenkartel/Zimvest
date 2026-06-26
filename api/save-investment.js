// api/save-investment.js
// Called by dashboard.html when user proceeds to EcoCash payment.
// Saves investment record to KV so admin panel can see + act on it.
// Requires valid session cookie (same as /api/me).

import jwt from 'jsonwebtoken';

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/zimvest_token=([^;]+)/);
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify session
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  let user;
  try { user = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid session' }); }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { plan, pct, hours, amount, payout } = body;
  if (!plan || !amount || !payout) return res.status(400).json({ error: 'Missing fields' });

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable' });

  try {
    const id = `${user.phone.replace(/\W/g,'')}_${Date.now()}`;
    const inv = {
      id,
      phone:     user.phone,
      name:      user.name || '—',
      plan:      String(plan),
      pct:       Number(pct),
      hours:     Number(hours),
      amount:    Number(amount),
      payout:    Number(payout),
      status:    'active',
      date:      new Date().toISOString(),
      maturesAt: new Date(Date.now() + Number(hours) * 3600000).toISOString(),
    };

    // Store with 30-day TTL
    await kv.set(`investment:${id}`, JSON.stringify(inv), { ex: 30 * 86400 });

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save investment', detail: err?.message });
  }
}
