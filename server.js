require('dotenv').config();
const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const mongoose = require('mongoose');

const app = express();

// ── MongoDB ───────────────────────────────────────────────────────────────────
// Fail fast: without this, queries queue silently while the DB is unreachable and requests hang.
mongoose.set('bufferCommands', false);
function connectMongo() {
  mongoose
    .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ollama-chat', { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => {
      // Mongoose only auto-reconnects after a first successful connect, so retry the initial one ourselves
      console.error('MongoDB error:', err.message, '— retrying in 5s');
      setTimeout(connectMongo, 5000);
    });
}
connectMongo();

const OLLAMA_BASE = () => process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

const UsageLog = require('./models/UsageLog');

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, x-api-key, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── React SPA at /chat (no auth) ──────────────────────────────────────────────
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
app.use('/chat', express.static(CLIENT_DIST));
app.use('/chat', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
app.get('/', (_req, res) => res.redirect('/chat'));

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const db = mongoose.connection.readyState === 1;
  const ollama = await axios.get(`${OLLAMA_BASE()}/api/version`, { timeout: 2000 })
    .then(() => true).catch(() => false);
  res.status(db && ollama ? 200 : 503).json({ db, ollama });
});

// Everything below needs the database: answer at once instead of hanging
app.use((_req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  res.status(503).json({ error: 'Database unavailable. Try again shortly, or ask your admin to check MongoDB.' });
});

// ── Public auth routes ────────────────────────────────────────────────────────
// Per-IP limits on credential endpoints slow down password guessing
const makeRateLimiter = require('./middleware/rateLimit');
app.use('/auth/login',    makeRateLimiter({ windowMs: 15 * 60_000, max: 20, message: 'Too many sign-in attempts. Wait 15 minutes and try again.' }));
app.use('/auth/register', makeRateLimiter({ windowMs: 60 * 60_000, max: 5,  message: 'Too many sign-up attempts. Try again in an hour.' }));
app.use('/auth', require('./routes/auth'));

// ── Middleware ────────────────────────────────────────────────────────────────
const requireAuth  = require('./middleware/auth');
const requireAdmin = require('./middleware/requireAdmin');
const checkLimits  = require('./middleware/checkLimits');
const { modelKey } = checkLimits;
const apiKeyAuth   = require('./middleware/apiKeyAuth');

// ── JWT-protected routes (web UI) ─────────────────────────────────────────────
app.use('/chats',    requireAuth, require('./routes/chats'));
app.use('/settings', requireAuth, require('./routes/settings'));
app.use('/apikeys',  requireAuth, requireAdmin, require('./routes/apikeys'));

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use('/admin', requireAuth, requireAdmin, require('./routes/admin'));

// ── Ollama endpoint allowlist ─────────────────────────────────────────────────
// Users and API keys may only run models. Model management (pull, delete,
// create, copy, push) stays behind /admin.
const OLLAMA_ALLOWED = {
  GET:  new Set(['/tags', '/ps', '/version']),
  POST: new Set(['/chat', '/generate', '/embed', '/embeddings', '/show']),
};
function ollamaAllowed(method, path) {
  return OLLAMA_ALLOWED[method]?.has(path.split('?')[0]) ?? false;
}

// OpenAI-compatible endpoints, served by Ollama's own /v1/* and exposed on our /v1/*
// next to the native routes. GET /models/{id} is matched separately.
const OPENAI_ALLOWED = {
  GET:  new Set(['/models']),
  POST: new Set(['/chat/completions', '/completions', '/embeddings']),
};
function openaiAllowed(method, path) {
  const p = path.split('?')[0];
  return (OPENAI_ALLOWED[method]?.has(p) ?? false) || (method === 'GET' && p.startsWith('/models/'));
}

// ── Ollama proxy helper ───────────────────────────────────────────────────────
//
// Streams the Ollama response to the client while intercepting the final
// `done: true` NDJSON line to extract token counts for usage logging.
//
async function proxyOllama(req, res, { targetUrl, userId, apiKeyId = null, source = 'web' }) {
  // Stop button / closed tab: cancel the upstream request so Ollama stops generating
  const upstream = new AbortController();
  res.on('close', () => { if (!res.writableFinished) upstream.abort(); });

  try {
    // Sanitise the forwarded body: strip undefined/NaN from options so they
    // don't reach Ollama as JSON null (which Ollama silently ignores).
    let forwardBody = req.body;
    if (forwardBody?.options && typeof forwardBody.options === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(forwardBody.options)) {
        if (v !== null && v !== undefined && Number.isFinite(v)) clean[k] = v;
      }
      forwardBody = { ...forwardBody, options: clean };
    }

    const response = await axios({
      method: req.method,
      url:    targetUrl,
      data:   forwardBody,
      responseType: 'stream',
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
      signal: upstream.signal,
    });

    if (response.headers['content-type']) {
      res.setHeader('content-type', response.headers['content-type']);
    }
    res.status(response.status);

    // Pass non-200 responses from Ollama straight through (preserves real error bodies)
    if (response.status !== 200) {
      return response.data.pipe(res);
    }

    // Only capture usage for inference POST requests that have a model field
    const shouldTrack = req.method === 'POST' && req.body?.model && userId;
    if (!shouldTrack) {
      return response.data.pipe(res);
    }

    let buf = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let seenDone = false;
    let streamedChunks = 0;

    function extractTokens(obj) {
      if (obj.message?.content || obj.response || obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.text) streamedChunks++;
      if (obj.usage) {
        // OpenAI-compatible: final stream chunk (we force include_usage) or the non-stream body
        promptTokens     = obj.usage.prompt_tokens ?? 0;
        completionTokens = obj.usage.completion_tokens ?? 0;
        seenDone = true;
      } else if (obj.done === true) {
        // Chat / generate streaming final chunk
        promptTokens     = obj.prompt_eval_count ?? 0;
        completionTokens = obj.eval_count ?? 0;
        seenDone = true;
      } else if (obj.embeddings !== undefined || obj.embedding !== undefined) {
        // Embed response — no done flag, only prompt tokens
        promptTokens = obj.prompt_eval_count ?? 0;
        seenDone = true;
      }
    }

    function parseLines(text) {
      const nl = text.lastIndexOf('\n');
      if (nl === -1) return text;
      for (const line of text.slice(0, nl + 1).split('\n')) {
        parseLine(line);
      }
      return text.slice(nl + 1);
    }

    // Native responses are NDJSON; OpenAI-compatible streams are SSE ("data: {...}", "data: [DONE]")
    function parseLine(line) {
      const json = line.trim().replace(/^data: /, '');
      if (!json || json === '[DONE]') return;
      try { extractTokens(JSON.parse(json)); } catch { /* non-JSON line — skip */ }
    }

    response.data.on('data', (chunk) => {
      res.write(chunk);
      buf += chunk.toString();
      buf = parseLines(buf);
    });

    const logUsage = () => UsageLog.create({
      userId, apiKeyId, source,
      model: req.body.model,
      promptTokens, completionTokens,
      totalTokens: promptTokens + completionTokens,
    }).catch((err) => console.error('[UsageLog] Failed to save:', err.message));

    response.data.on('end', () => {
      // Flush any remainder that arrived without a trailing newline
      if (buf.trim()) parseLine(buf);
      res.end();
      // Log every completed inference request; token counts are 0 when Ollama omits them
      logUsage();
    });

    response.data.on('error', () => {
      if (upstream.signal.aborted) {
        // Stopped early: Ollama never sends its final counts, so bill one token per streamed chunk.
        // ponytail: prompt tokens are lost on abort; count them client-side if limits must be exact
        if (!seenDone) completionTokens = streamedChunks;
        return logUsage();
      }
      if (!res.headersSent) res.status(500).json({ error: 'Proxy stream error' });
    });

  } catch (err) {
    if (upstream.signal.aborted) return;
    if (!res.headersSent) {
      res.status(502).json({ error: 'Could not reach Ollama — is the server running?' });
    }
  }
}

// Model list filtered to the user's allowed models (admins and unrestricted users see all)
async function listAllowedModels(req, res) {
  try {
    const { data } = await axios.get(`${OLLAMA_BASE()}/api/tags`, { timeout: 10_000 });
    const allowed = req.allowedModels;
    res.json(allowed?.length ? { ...data, models: data.models.filter((m) => allowed.includes(m.name)) } : data);
  } catch {
    res.status(502).json({ error: 'Could not reach Ollama — is the server running?' });
  }
}

// ── JWT-protected Ollama proxy (web UI) ───────────────────────────────────────
app.use('/api', requireAuth, (req, res, next) => {
  if (!ollamaAllowed(req.method, req.path)) return res.status(403).json({ error: 'This Ollama endpoint is admin-only' });
  next();
}, checkLimits, (req, res) => {
  if (req.method === 'GET' && req.path === '/tags') return listAllowedModels(req, res);
  const base = OLLAMA_BASE();
  proxyOllama(req, res, {
    targetUrl: `${base}${req.originalUrl}`,
    userId:    req.userId,
    source:    'web',
  });
});

// OpenAI-format model list, filtered the same way as /tags
async function listAllowedOpenAIModels(req, res) {
  try {
    const { data } = await axios.get(`${OLLAMA_BASE()}/v1/models`, { timeout: 10_000 });
    const allowed = req.allowedModels;
    res.json(allowed?.length ? { ...data, data: data.data.filter((m) => allowed.includes(modelKey(m.id))) } : data);
  } catch {
    res.status(502).json({ error: 'Could not reach Ollama — is the server running?' });
  }
}

// ── API-key-protected external integration endpoint ───────────────────────────
//
//  Two APIs on one prefix:
//    OpenAI-compatible  /v1/chat/completions, /v1/completions, /v1/embeddings, /v1/models
//                       → Ollama /v1/*  (point any OpenAI SDK at base_url=<server>/v1)
//    Ollama native      /v1/chat, /v1/generate, /v1/embed, /v1/tags, /v1/show, ...
//                       → Ollama /api/*
//  Auth: x-api-key header, or Authorization: Bearer <key> (what OpenAI SDKs send)
//
app.use('/v1', apiKeyAuth, (req, res, next) => {
  req.openai = openaiAllowed(req.method, req.url);
  if (!req.openai && !ollamaAllowed(req.method, req.url)) {
    return res.status(403).json({ error: 'This Ollama endpoint is admin-only' });
  }
  next();
}, checkLimits, (req, res) => {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' && path === '/tags')   return listAllowedModels(req, res);
  if (req.method === 'GET' && path === '/models') return listAllowedOpenAIModels(req, res);
  if (req.method === 'GET' && path.startsWith('/models/') && req.allowedModels?.length
      && !req.allowedModels.includes(modelKey(decodeURIComponent(path.slice('/models/'.length))))) {
    return res.status(404).json({ error: 'Model not found' });
  }

  // Ollama only reports token usage on an OpenAI stream when asked; we need it for limits
  if (req.openai && req.body?.stream) {
    req.body = { ...req.body, stream_options: { ...req.body.stream_options, include_usage: true } };
  }

  proxyOllama(req, res, {
    targetUrl: `${OLLAMA_BASE()}${req.openai ? '/v1' : '/api'}${req.url}`,
    userId:    req.userId,
    apiKeyId:  req.apiKeyId,
    source:    'api',
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Ollama App   → http://localhost:${PORT}/chat`);
  console.log(`Admin Panel  → http://localhost:${PORT}/chat/admin`);
  console.log(`Ollama API   → http://localhost:${PORT}/v1/*  (API key required; OpenAI-compatible + native)`);
});
