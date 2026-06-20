const h = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

export async function listApiKeys(token) {
  const res = await fetch('/apikeys', { headers: h(token) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load API keys');
  return data;
}

export async function createApiKey(token, name) {
  const res = await fetch('/apikeys', {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create API key');
  return data; // { id, name, keyPrefix, createdAt, key }  ← key shown once
}

export async function revokeApiKey(token, id) {
  const res = await fetch(`/apikeys/${id}`, { method: 'DELETE', headers: h(token) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke API key');
  return data;
}
