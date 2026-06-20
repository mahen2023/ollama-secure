const h = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

export async function fetchModels(token) {
  const res = await fetch('/api/tags', { headers: h(token) });
  if (res.status === 401) throw new Error('Session expired');
  if (!res.ok) throw new Error('Could not reach Ollama — is the server running?');
  const data = await res.json();
  return data.models ?? [];
}

export async function streamChat({ token, model, messages, systemPrompt, temperature, onChunk, onDone, signal }) {
  const payload = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ model, messages: payload, stream: true, options: { temperature } }),
    signal,
  });

  if (res.status === 401) throw new Error('Session expired');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed (${res.status})`);
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
        try {
          const data = JSON.parse(line);
          if (data.message?.content) onChunk(data.message.content);
          if (data.done) { onDone?.(); return; }
        } catch { /* skip malformed line */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  onDone?.();
}

export async function generateTitle(token, model, userMessage) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: `In 5 words or fewer, give a title for a conversation starting with: "${userMessage.slice(0, 200)}". Reply with only the title, no punctuation.`,
      }],
      stream: false,
      options: { temperature: 0.3 },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.message?.content?.trim() ?? null;
}
