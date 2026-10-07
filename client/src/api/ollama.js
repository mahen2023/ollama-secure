const h = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

export async function fetchModels(token) {
  const res = await fetch('/api/tags', { headers: h(token) });
  if (res.status === 401) throw new Error('Session expired');
  if (!res.ok) throw new Error('Could not reach Ollama — is the server running?');
  const data = await res.json();
  return data.models ?? [];
}

function buildOptions(temperature, contextLength) {
  const opts = {};
  if (Number.isFinite(temperature))                              opts.temperature = temperature;
  if (Number.isFinite(contextLength) && contextLength > 0)      opts.num_ctx     = contextLength;
  return opts;
}

export async function streamChat({ token, model, messages, systemPrompt, temperature, contextLength, keepAlive, onChunk, onDone, signal }) {
  const payload = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ model, messages: payload, stream: true, keep_alive: keepAlive, options: buildOptions(temperature, contextLength) }),
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
          if (data.done) { await onDone?.(); return; }
        } catch { /* skip malformed line */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  await onDone?.();
}

// Loads the model into memory without generating anything (Ollama: empty prompt).
export function warmModel(token, model) {
  return fetch('/api/generate', {
    method: 'POST',
    headers: h(token),
    body: JSON.stringify({ model, keep_alive: VOICE_KEEP_ALIVE }),
  }).catch(() => {});
}

// How long Ollama keeps the model loaded after a voice-mode request (default is 5m)
export const VOICE_KEEP_ALIVE = '30m';

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
