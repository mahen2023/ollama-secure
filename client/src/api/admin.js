const h = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

async function req(token, path, options = {}) {
  const res  = await fetch(path, { headers: h(token), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export const getAdminUsers     = (token)           => req(token, '/admin/users');
export const createAdminUser   = (token, body)     => req(token, '/admin/users/create', { method: 'POST', body: JSON.stringify(body) });
export const updateAdminUser   = (token, id, body) => req(token, `/admin/users/${id}`,  { method: 'PATCH',  body: JSON.stringify(body) });
export const deleteAdminUser   = (token, id)       => req(token, `/admin/users/${id}`,  { method: 'DELETE' });

// ── API Keys ──────────────────────────────────────────────────────────────────
export const getAdminApiKeys   = (token)     => req(token, '/admin/apikeys');
export const revokeAdminApiKey = (token, id) => req(token, `/admin/apikeys/${id}`, { method: 'DELETE' });

// ── Models ────────────────────────────────────────────────────────────────────
export const getAdminModels    = (token)      => req(token, '/admin/models');
export const deleteAdminModel  = (token, name) =>
  req(token, '/admin/models', { method: 'DELETE', body: JSON.stringify({ name }) });

// Pull streams NDJSON — caller handles the ReadableStream
export async function pullAdminModel(token, name, onProgress) {
  const res = await fetch('/admin/models/pull', {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Pull failed (${res.status})`);
  }
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { onProgress(JSON.parse(line)); } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getAdminAnalytics = (token, days = 30) => req(token, `/admin/analytics?days=${days}`);

// ── Audit log ─────────────────────────────────────────────────────────────────
export const getAuditLog = (token, { limit = 100, skip = 0 } = {}) =>
  req(token, `/admin/auditlog?limit=${limit}&skip=${skip}`);
