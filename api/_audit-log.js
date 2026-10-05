const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeEntry(entry, details) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return { ...entry };
  }

  return {
    ...(details && typeof details === 'object' ? details : {}),
    action: String(entry || 'unknown')
  };
}

async function logAudit(entry, details) {
  const payload = normalizeEntry(entry, details);

  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL is not configured');
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  const response = await fetch(
    `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/klaro_activity_log`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Audit log write failed (${response.status}): ${errorText || response.statusText}`
    );
  }

  return true;
}

module.exports = {
  logAudit,
  logAuditEvent: logAudit,
  writeAuditLog: logAudit,
  logActivity: logAudit
};
