const { cookieOptions } = require('./_admin-auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  res.setHeader('Set-Cookie', `klaro_admin=; ${cookieOptions(0)}`);
  return res.status(200).json({ ok: true });
};
