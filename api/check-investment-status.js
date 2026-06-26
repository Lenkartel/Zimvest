// api/check-investment-status.js
// Called by dashboard.html on history load to sync admin-set statuses (e.g. rejected).
// Body: { ids: string[] }   — list of investment IDs to check
// Returns: { statuses: { [id]: 'active'|'paid'|'rejected' } }
// No auth required — IDs are opaque (phone+timestamp) and only return status.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const ids = Array.isArray(body.ids) ? body.ids.slice(0, 50) : [];
  if (!ids.length) return res.status(200).json({ statuses: {} });

  const kv = await getKV();
  if (!kv) return res.status(200).json({ statuses: {} }); // graceful — client uses local

  try {
    const results = await Promise.all(
      ids.map(async id => {
        try {
          const raw = await kv.get(`investment:${id}`);
          if (!raw) return [id, null];
          const inv = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return [id, inv.status || 'active'];
        } catch { return [id, null]; }
      })
    );

    const statuses = {};
    results.forEach(([id, status]) => { if (status) statuses[id] = status; });

    return res.status(200).json({ statuses });
  } catch (err) {
    return res.status(200).json({ statuses: {} }); // graceful fallback
  }
}
