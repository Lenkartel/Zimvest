// api/reset-check.js
// Checks whether a phone number has a registered account in KV.
// Does NOT change any data — purely a lookup to gate step 2.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { phone } = body;

  if (!phone || !/^\+263[0-9]{9}$/.test(phone))
    return res.status(400).json({ error: 'Invalid EcoCash number.' });

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable. Please try again shortly.' });

  const raw = await kv.get(`user:${phone}`).catch(() => null);
  if (!raw)
    return res.status(404).json({ error: 'No account found for this number. Please register first.' });

  // Account exists — tell client to proceed to step 2
  return res.status(200).json({ ok: true });
}
