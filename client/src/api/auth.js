async function request(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const login    = (username, password) => request('/auth/login',    { username, password });
export const register = (username, password) => request('/auth/register', { username, password });

export async function verifyToken(token) {
  const res = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Session expired');
  return res.json(); // { user }
}
