// api/admin-investments.js
// Returns all investment records from KV for the admin panel.
// Investments are stored as investment:<id> keys by the dashboard/login flow.
// Protected by ADMIN_SECRET header.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable. Ensure Vercel KV is linked.' });

  try {
    // Scan investment:* keys
    let cursor = 0;
    const keys = [];
    do {
      const result = await kv.scan(cursor, { match: 'investment:*', count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    if (!keys.length) return res.status(200).json({ count: 0, investments: [] });

    const investments = await Promise.all(
      keys.map(async key => {
        try {
          const raw = await kv.get(key);
          const inv = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return {
            id:        inv.id        || key.replace('investment:', ''),
            phone:     inv.phone     || '—',
            name:      inv.name      || '—',
            plan:      inv.plan      || '—',
            amount:    inv.amount    || 0,
            payout:    inv.payout    || 0,
            pct:       inv.pct       || 0,
            hours:     inv.hours     || 0,
            status:    inv.status    || 'active',
            date:      inv.date      || null,
            maturesAt: inv.maturesAt || null,
            rejectedAt:inv.rejectedAt|| null,
            rejectedBy:inv.rejectedBy|| null,
          };
        } catch { return null; }
      })
    );

    const valid = investments
      .filter(Boolean)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return res.status(200).json({ count: valid.length, investments: valid });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch investments', detail: err?.message });
  }
}
