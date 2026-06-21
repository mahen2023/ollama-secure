async function request(path, body) {
  const res  = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err  = new Error(data.error || 'Request failed');
    err.code   = data.code ?? null;
    throw err;
  }
  return data;
}

export const login    = (username, password) => request('/auth/login',    { username, password });
export const register = (username, password) => request('/auth/register', { username, password });

export async function deleteAccount(token, password) {
  const res = await fetch('/auth/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Account deletion failed');
  return data;
}

export async function changePassword(token, { current, newPassword }) {
  const res = await fetch('/auth/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Password change failed');
  return data;
}

export async function verifyToken(token) {
  const res = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Session expired');
  return res.json(); // { user }
}
