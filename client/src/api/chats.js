const h = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

async function req(token, method, path, body) {
  const res = await fetch(path, { method, headers: h(token), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `${method} ${path} failed`);
  return data;
}

export const listChats      = (token)               => req(token, 'GET',    '/chats');
export const createChat     = (token, body)          => req(token, 'POST',   '/chats', body);
export const getChat        = (token, id)            => req(token, 'GET',    `/chats/${id}`);
export const patchChat      = (token, id, body)      => req(token, 'PATCH',  `/chats/${id}`, body);
export const deleteChat     = (token, id)            => req(token, 'DELETE', `/chats/${id}`);
export const appendMessages   = (token, id, messages)  => req(token, 'POST',   `/chats/${id}/messages`, { messages });
export const truncateMessages = (token, id, fromIndex) => req(token, 'PATCH',  `/chats/${id}/messages/truncate`, { fromIndex });
export const clearMessages    = (token, id)            => req(token, 'DELETE', `/chats/${id}/messages`);
