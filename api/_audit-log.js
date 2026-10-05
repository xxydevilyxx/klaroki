const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeEntry(entry, details) {
  const source =
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry
      : {
          ...(details && typeof details === 'object' ? details : {}),
          action: String(entry || 'unknown')
        };

  return {
    action: source.action,
    source_type: source.sourceType ?? source.source_type ?? null,
    source_name: source.sourceName ?? source.source_name ?? null,
    source_table: source.sourceTable ?? source.source_table ?? null,
    record_id: source.recordId ?? source.record_id ?? null,
    request_id: source.requestId ?? source.request_id ?? null,
    query_text: source.queryText ?? source.query_text ?? null,
    written_data: source.writtenData ?? source.written_data ?? null,
    result_data: source.resultData ?? source.result_data ?? null,
    status: source.status ?? null,
    error_message: source.errorMessage ?? source.error_message ?? null,
    metadata: source.metadata ?? null
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
