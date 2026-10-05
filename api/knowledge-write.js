const { isAdmin } = require('./_admin-auth');
const { logActivity } = require('./_audit-log');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iiogaaolzzpveefthdxj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clean(value, max = 12000) {
  return String(value ?? '').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Nicht autorisiert.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Supabase server access is not configured.' });

  const body = req.body || {};
  const question = clean(body.question);
  const answer = clean(body.answer);
  const source = clean(body.source, 2000) || 'Klaro KI';
  const requestId = clean(req.headers['x-vercel-id'] || req.headers['x-request-id'] || '', 200) || null;

  if (!question || !answer) {
    return res.status(400).json({ error: 'question und answer sind erforderlich.' });
  }

  const writtenData = { question, answer, source };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/knowledge`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(writtenData)
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text || null; }

    if (!response.ok) {
      const message = typeof data === 'string' ? data : (data?.message || data?.error || `HTTP ${response.status}`);
      await logActivity({
        action: 'WRITE',
        sourceType: 'database',
        sourceName: 'Supabase',
        sourceTable: 'knowledge',
        requestId,
        writtenData,
        status: 'error',
        errorMessage: String(message),
        metadata: { endpoint: '/rest/v1/knowledge', http_status: response.status }
      });
      return res.status(502).json({ error: `Knowledge write failed: ${String(message).slice(0, 300)}` });
    }

    const record = Array.isArray(data) ? data[0] : data;
    const recordId = record?.id != null ? String(record.id) : null;

    await logActivity({
      action: 'WRITE',
      sourceType: 'database',
      sourceName: 'Supabase',
      sourceTable: 'knowledge',
      recordId,
      requestId,
      writtenData,
      resultData: record || null,
      status: 'success',
      metadata: { endpoint: '/rest/v1/knowledge', http_status: response.status }
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ ok: true, record });
  } catch (error) {
    await logActivity({
      action: 'WRITE',
      sourceType: 'database',
      sourceName: 'Supabase',
      sourceTable: 'knowledge',
      requestId,
      writtenData,
      status: 'error',
      errorMessage: error?.message || String(error),
      metadata: { endpoint: '/rest/v1/knowledge' }
    });
    return res.status(500).json({ error: error?.message || String(error) });
  }
}
