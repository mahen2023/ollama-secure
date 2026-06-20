const h = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

async function req(token, path, options = {}) {
  const res  = await fetch(path, { headers: h(token), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const getAdminUsers      = (token)           => req(token, '/admin/users');
export const updateAdminUser    = (token, id, body) => req(token, `/admin/users/${id}`,   { method: 'PATCH', body: JSON.stringify(body) });
export const deleteAdminUser    = (token, id)       => req(token, `/admin/users/${id}`,   { method: 'DELETE' });
export const getAdminApiKeys    = (token)           => req(token, '/admin/apikeys');
export const revokeAdminApiKey  = (token, id)       => req(token, `/admin/apikeys/${id}`, { method: 'DELETE' });
export const getAdminAnalytics  = (token, days = 30) => req(token, `/admin/analytics?days=${days}`);
