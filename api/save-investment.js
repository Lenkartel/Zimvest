// api/save-investment.js
// Saves investment record to KV.
// Client generates the ID (phone_timestamp) and sends it — same ID stored in
// localStorage so check-investment-status can match them.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { id, phone, name, plan, pct, hours, amount, payout } = body;
  if (!phone || !plan || !amount || !payout) {
    return res.status(400).json({ error: 'Missing required fields: phone, plan, amount, payout' });
  }

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable' });

  try {
    // Use client-provided ID so localStorage and KV share the same key
    const kvId = id || (String(phone).replace(/\W/g, '') + '_' + Date.now());
    const inv = {
      id:        kvId,
      phone:     String(phone),
      name:      String(name || '—'),
      plan:      String(plan),
      pct:       Number(pct) || 0,
      hours:     Number(hours) || 0,
      amount:    Number(amount),
      payout:    Number(payout),
      status:    'pending', /* updated to active after EcoCash OTP confirmed */
      date:      new Date().toISOString(),
      maturesAt: new Date(Date.now() + (Number(hours) || 0) * 3600000).toISOString(),
    };
    await kv.set(`investment:${kvId}`, JSON.stringify(inv), { ex: 30 * 86400 });
    return res.status(200).json({ ok: true, id: kvId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save', detail: err?.message });
  }
}
