const crypto = require('crypto');

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function sign(value) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  return b64url(crypto.createHmac('sha256', secret).update(value).digest());
}

function createSession() {
  const payload = { role: 'admin', exp: Date.now() + 8 * 60 * 60 * 1000 };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isAdmin(req) {
  try {
    const token = parseCookies(req).klaro_admin;
    if (!token) return false;
    const [body, signature] = token.split('.');
    if (!body || !signature) return false;
    const expected = sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.role === 'admin' && Number(payload.exp) > Date.now();
  } catch (_) {
    return false;
  }
}

function cookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; Path=/; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

module.exports = { createSession, isAdmin, cookieOptions };
