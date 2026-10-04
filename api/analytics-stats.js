const { isAdmin } = require('./_admin-auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iiogaaolzzpveefthdxj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Analytics server is not configured.' });

  try {
    const requestedDays = Number(req.query?.days || 30);
    const days = Math.min(Math.max(Number.isFinite(requestedDays) ? requestedDays : 30, 1), 365);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_klaro_analytics`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_days: days })
    });

    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!r.ok) return res.status(502).json({ error: data?.message || data?.hint || text || 'Analytics query failed.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data || {});
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
};
