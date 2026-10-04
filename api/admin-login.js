const crypto = require('crypto');
const { createSession, cookieOptions } = require('./_admin-auth');

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ error: 'Admin-Login ist noch nicht konfiguriert.' });
  }

  const { email, password } = req.body || {};
  if (!safeEqual(String(email || '').trim().toLowerCase(), adminEmail.trim().toLowerCase()) || !safeEqual(password, adminPassword)) {
    return res.status(401).json({ error: 'E-Mail oder Passwort ist falsch.' });
  }

  res.setHeader('Set-Cookie', `klaro_admin=${createSession()}; ${cookieOptions(8 * 60 * 60)}`);
  return res.status(200).json({ ok: true });
};
