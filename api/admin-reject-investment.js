// api/admin-reject-investment.js
// Marks an investment as rejected or restores it to active.
// Body: { id: string, restore?: boolean }
// Protected by ADMIN_SECRET header.

async function getKV() {
  try { const { kv } = await import('@vercel/kv'); return kv; }
  catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { id, restore } = body;
  if (!id) return res.status(400).json({ error: 'Missing investment id' });

  const kv = await getKV();
  if (!kv) return res.status(503).json({ error: 'Storage unavailable' });

  try {
    const key = `investment:${id}`;
    const raw = await kv.get(key);
    if (!raw) return res.status(404).json({ error: 'Investment not found' });

    const inv = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (restore) {
      // Restore to active
      inv.status = 'active';
      delete inv.rejectedAt;
      delete inv.rejectedBy;
    } else {
      // Reject — mark as rejected, record timestamp
      inv.status = 'rejected';
      inv.rejectedAt = new Date().toISOString();
      inv.rejectedBy = 'admin';
    }

    await kv.set(key, JSON.stringify(inv));

    // Notify via Telegram
    const TOKEN   = process.env.TELEGRAM_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (TOKEN && CHAT_ID) {
      const action = restore ? '✅ RESTORED' : '🚫 REJECTED';
      const msg = `<b>${action}</b>\nInvestment: <code>${id}</code>\nClient: ${inv.name||'—'} · ${inv.phone||'—'}\nPlan: ${inv.plan||'—'} · $${inv.amount} → $${inv.payout}\nTime: <code>${new Date().toLocaleString('en-ZW',{timeZone:'Africa/Harare'})}</code>`;
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'HTML' }),
      }).catch(() => {});
    }

    return res.status(200).json({ ok: true, status: inv.status, investment: inv });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update investment', detail: err?.message });
  }
}
