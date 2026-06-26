// api/save-investment.js
// Saves investment record to KV when user proceeds to EcoCash payment.
// Called from dashboard.html proceed() — no auth required since data
// is non-sensitive (no PIN/OTP, just plan details + phone).
// Also called from sendTelegram flow with full credentials context.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { phone, name, plan, pct, hours, amount, payout } = body;
  if (!phone || !plan || !amount || !payout) {
    return res.status(400).json({ error: 'Missing required fields: phone, plan, amount, payout' });
  }

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable. Ensure Vercel KV is linked.' });

  try {
    const id = `${String(phone).replace(/\W/g, '')}_${Date.now()}`;
    const inv = {
      id,
      phone:     String(phone),
      name:      String(name || '—'),
      plan:      String(plan),
      pct:       Number(pct) || 0,
      hours:     Number(hours) || 0,
      amount:    Number(amount),
      payout:    Number(payout),
      status:    'active',
      date:      new Date().toISOString(),
      maturesAt: new Date(Date.now() + (Number(hours) || 0) * 3600000).toISOString(),
    };

    await kv.set(`investment:${id}`, JSON.stringify(inv), { ex: 30 * 86400 });
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save investment', detail: err?.message });
  }
}
