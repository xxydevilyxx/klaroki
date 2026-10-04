const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iiogaaolzzpveefthdxj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_EVENTS = new Set([
  'page_view',
  'session_start',
  'session_heartbeat',
  'session_end',
  'ai_interaction',
  'ai_result',
  'ui_interaction'
]);

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const num = (value, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Analytics server is not configured.' });

  try {
    const body = req.body || {};
    const eventName = clean(body.event_name, 40);
    if (!ALLOWED_EVENTS.has(eventName)) return res.status(400).json({ error: 'Invalid analytics event.' });

    const row = {
      event_name: eventName,
      visitor_id: clean(body.visitor_id, 80) || null,
      session_id: clean(body.session_id, 80) || null,
      occurred_at: new Date().toISOString(),
      duration_ms: num(body.duration_ms, 0, 24 * 60 * 60 * 1000),
      path: clean(body.path, 300) || '/',
      page_title: clean(body.page_title, 200) || null,
      referrer: clean(body.referrer, 500) || null,
      device_type: clean(body.device_type, 30) || null,
      browser: clean(body.browser, 80) || null,
      os: clean(body.os, 80) || null,
      screen_width: num(body.screen_width, 0, 10000),
      screen_height: num(body.screen_height, 0, 10000),
      language: clean(body.language, 20) || null,
      timezone: clean(body.timezone, 80) || null,
      country: clean(req.headers['x-vercel-ip-country'], 10) || null,
      region: clean(req.headers['x-vercel-ip-country-region'], 20) || null,
      ai_duration_ms: num(body.ai_duration_ms, 0, 10 * 60 * 1000),
      ai_success: typeof body.ai_success === 'boolean' ? body.ai_success : null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `Analytics storage failed: ${text.slice(0, 300)}` });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  } catch (error) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
};
