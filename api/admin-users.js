// api/admin-users.js
// Returns list of all registered users for the admin panel.
// Protected by ADMIN_SECRET env var — never expose without it.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth: require secret header ──
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable' });

  try {
    // Scan all keys matching user:* pattern
    let cursor = 0;
    const keys = [];
    do {
      const result = await kv.scan(cursor, { match: 'user:*', count: 100 });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    // Fetch each user record
    const users = await Promise.all(
      keys.map(async key => {
        try {
          const raw = await kv.get(key);
          const u = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return {
            phone:     u.phone     || key.replace('user:', ''),
            name:      u.name      || '—',
            createdAt: u.createdAt || null,
            updatedAt: u.updatedAt || null,
            // Never return hash
          };
        } catch {
          return null;
        }
      })
    );

    const valid = users.filter(Boolean).sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    return res.status(200).json({ count: valid.length, users: valid });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch users', detail: err?.message });
  }
}
