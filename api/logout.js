// api/logout.js — ZimVest
// Clears the zimvest_session cookie to log the user out.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  res.setHeader('Set-Cookie', 'zimvest_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return res.status(200).json({ ok: true });
}
