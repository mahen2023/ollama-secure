require('dotenv').config();
const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const mongoose = require('mongoose');

const app = express();

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ollama-chat')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err.message));

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

// ── Public auth routes ────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));

// ── Middleware ────────────────────────────────────────────────────────────────
const requireAuth  = require('./middleware/auth');
const requireAdmin = require('./middleware/requireAdmin');
const checkLimits  = require('./middleware/checkLimits');
const apiKeyAuth   = require('./middleware/apiKeyAuth');

// ── JWT-protected routes (web UI) ─────────────────────────────────────────────
app.use('/chats',    requireAuth, require('./routes/chats'));
app.use('/settings', requireAuth, require('./routes/settings'));
app.use('/apikeys',  requireAuth, requireAdmin, require('./routes/apikeys'));

// ── Admin routes ──────────────────────────────────────────────────────────────
app.use('/admin', requireAuth, requireAdmin, require('./routes/admin'));

// ── Ollama proxy helper ───────────────────────────────────────────────────────
//
// Streams the Ollama response to the client while intercepting the final
// `done: true` NDJSON line to extract token counts for usage logging.
//
async function proxyOllama(req, res, { targetUrl, userId, apiKeyId = null, source = 'web' }) {
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

    function extractTokens(obj) {
      if (obj.done === true) {
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
        if (!line.trim()) continue;
        try { extractTokens(JSON.parse(line)); } catch { /* non-JSON line — skip */ }
      }
      return text.slice(nl + 1);
    }

    response.data.on('data', (chunk) => {
      res.write(chunk);
      buf += chunk.toString();
      buf = parseLines(buf);
    });

    response.data.on('end', () => {
      // Flush any remainder that arrived without a trailing newline
      if (buf.trim()) {
        try { extractTokens(JSON.parse(buf.trim())); } catch { /* not valid JSON */ }
      }
      res.end();
      // Log every completed inference request; token counts are 0 when Ollama omits them
      UsageLog.create({
        userId, apiKeyId, source,
        model: req.body.model,
        promptTokens, completionTokens,
        totalTokens: promptTokens + completionTokens,
      }).catch((err) => console.error('[UsageLog] Failed to save:', err.message));
    });

    response.data.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Proxy stream error' });
    });

  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Could not reach Ollama — is the server running?' });
    }
  }
}

// ── JWT-protected Ollama proxy (web UI) ───────────────────────────────────────
app.use('/api', requireAuth, checkLimits, (req, res) => {
  const base = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  proxyOllama(req, res, {
    targetUrl: `${base}${req.originalUrl}`,
    userId:    req.userId,
    source:    'web',
  });
});

// ── API-key-protected external integration endpoint ───────────────────────────
//
//  Maps /v1/* → Ollama /api/*
//  /v1/embeddings is remapped to /api/embed (OpenAI-compat uses `input`, same as /api/embed)
//  Auth: x-api-key header (manage keys in Settings → API Keys)
//
app.use('/v1', apiKeyAuth, checkLimits, (req, res) => {
  const base = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaPath = req.url.replace(/^\/embeddings(\?|$)/, '/embed$1');
  proxyOllama(req, res, {
    targetUrl: `${base}/api${ollamaPath}`,
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
  console.log(`Ollama API   → http://localhost:${PORT}/v1/*  (x-api-key required)`);
});
