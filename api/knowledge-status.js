const { isAdmin } = require('./_admin-auth');

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://iiogaaolzzpveefthdxj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

async function readKnowledge() {
  const response = await fetch(
    `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/knowledge?select=id&limit=1`,
    { headers: headers() }
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`READ HTTP ${response.status}: ${text.slice(0, 300)}`);
  return true;
}

async function writeAndCleanup() {
  const marker = `__KLARO_SYSTEM_CHECK__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    question: marker,
    answer: 'Temporärer Systemtest – wird sofort entfernt.',
    source: 'system-healthcheck'
  };

  const insert = await fetch(
    `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/knowledge`,
    {
      method: 'POST',
      headers: { ...headers(), Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    }
  );

  const insertText = await insert.text();
  if (!insert.ok) {
    throw new Error(`WRITE HTTP ${insert.status}: ${insertText.slice(0, 300)}`);
  }

  let rows = [];
  try { rows = insertText ? JSON.parse(insertText) : []; } catch (_) {}
  const record = Array.isArray(rows) ? rows[0] : rows;
  const id = record?.id;

  if (id == null) {
    throw new Error('WRITE erfolgreich, aber keine Datensatz-ID zurückgegeben.');
  }

  let cleanupError = null;
  try {
    const del = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/knowledge?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: headers()
      }
    );
    if (!del.ok) {
      cleanupError = `Cleanup HTTP ${del.status}: ${(await del.text()).slice(0, 300)}`;
    }
  } catch (error) {
    cleanupError = error?.message || String(error);
  }

  if (cleanupError) {
    throw new Error(`WRITE erfolgreich; Cleanup fehlgeschlagen: ${cleanupError}`);
  }

  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Nicht autorisiert.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase server access is not configured.' });
  }

  const result = {
    read: { ok: false, label: 'FEHLER' },
    write: { ok: false, label: 'FEHLER' }
  };

  try {
    await readKnowledge();
    result.read = { ok: true, label: 'AKTIV' };
  } catch (error) {
    result.read = { ok: false, label: 'FEHLER', detail: error?.message || String(error) };
  }

  try {
    await writeAndCleanup();
    result.write = { ok: true, label: 'AKTIV' };
  } catch (error) {
    result.write = { ok: false, label: 'FEHLER', detail: error?.message || String(error) };
  }

  const ok = result.read.ok && result.write.ok;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok, ...result });
}
