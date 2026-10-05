const { isAdmin } = require('./_admin-auth');

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://iiogaaolzzpveefthdxj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Nicht autorisiert.' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      error: 'Supabase server access is not configured.'
    });
  }

  const rawLimit = Number.parseInt(req.query?.limit ?? '100', 10);
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1),
    200
  );

  const status = String(req.query?.status ?? '').trim().toLowerCase();

  if (status && !['success', 'error'].includes(status)) {
    return res.status(400).json({
      error: 'Ungültiger status. Erlaubt sind success oder error.'
    });
  }

  const params = new URLSearchParams();
  params.set(
    'select',
    [
      'id',
      'created_at',
      'action',
      'source_type',
      'source_name',
      'source_table',
      'record_id',
      'request_id',
      'query_text',
      'written_data',
      'result_data',
      'status',
      'error_message',
      'metadata'
    ].join(',')
  );
  params.set('order', 'created_at.desc');
  params.set('limit', String(limit));

  if (status) {
    params.set('status', `eq.${status}`);
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/klaro_activity_log?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: 'application/json'
        }
      }
    );

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : [];
    } catch (_) {
      data = text || [];
    }

    if (!response.ok) {
      const message =
        typeof data === 'string'
          ? data
          : data?.message || data?.error || `HTTP ${response.status}`;

      return res.status(502).json({
        error: `Audit log read failed: ${String(message).slice(0, 500)}`
      });
    }

    const rows = Array.isArray(data) ? data : [];

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      rows,
      count: rows.length
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || String(error)
    });
  }
}
