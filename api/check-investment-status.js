// api/check-investment-status.js  v2
// Fetches ALL investment records for a given phone number from KV.
// Dashboard uses this to sync statuses — no ID matching needed.
// Body: { phone: string }
// Returns: { investments: [{id, status, plan, amount, payout, date, maturesAt}] }

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const phone = String(body.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'Missing phone' });

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'KV unavailable' });

  try {
    // Scan all investment keys for this phone
    const phoneKey = phone.replace(/\W/g, '');
    let cursor = 0;
    const keys = [];
    do {
      const result = await kv.scan(cursor, { match: `investment:${phoneKey}_*`, count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    if (!keys.length) return res.status(200).json({ investments: [] });

    const investments = await Promise.all(
      keys.map(async key => {
        try {
          const raw = await kv.get(key);
          if (!raw) return null;
          const inv = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return { id: inv.id, status: inv.status || 'active' };
        } catch { return null; }
      })
    );

    return res.status(200).json({
      investments: investments.filter(Boolean)
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
}
