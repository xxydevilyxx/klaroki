const { isAdmin } = require('./_admin-auth');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iiogaaolzzpveefthdxj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Audit server is not configured.' });

  try {
    const requestedLimit = Number(req.query?.limit || 100);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 200);
    const status = String(req.query?.status || '').trim().toLowerCase();

    const params = new URLSearchParams({
      select: 'id,created_at,action,source_type,source_name,source_table,record_id,request_id,query_text,written_data,result_data,status,error_message,metadata',
      order: 'created_at.desc',
      limit: String(limit)
    });

    if (status === 'success' || status === 'error') {
      params.set('status', `eq.${status}`);
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/klaro_activity_log?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json'
      }
    });

    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!r.ok) {
      return res.status(502).json({
        error: data?.message || data?.hint || text || `Audit query failed (HTTP ${r.status}).`
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      rows: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
};
