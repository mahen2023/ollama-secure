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
app.use(express.json({ limit: '4mb' }));

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
    const response = await axios({
      method: req.method,
      url:    targetUrl,
      data:   req.body,
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

    response.data.on('data', (chunk) => {
      res.write(chunk);
      buf += chunk.toString();
      // Parse complete newline-delimited JSON lines
      const nl = buf.lastIndexOf('\n');
      if (nl === -1) return;
      const lines = buf.slice(0, nl + 1).split('\n');
      buf = buf.slice(nl + 1);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.done === true) {
            promptTokens     = obj.prompt_eval_count ?? 0;
            completionTokens = obj.eval_count ?? 0;
          }
        } catch { /* non-JSON line — skip */ }
      }
    });

    response.data.on('end', () => {
      res.end();
      const totalTokens = promptTokens + completionTokens;
      if (totalTokens > 0) {
        UsageLog.create({
          userId, apiKeyId, source,
          model: req.body.model,
          promptTokens, completionTokens, totalTokens,
        }).catch(() => {});
      }
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
//  Auth: x-api-key header (manage keys in Settings → API Keys)
//
app.use('/v1', apiKeyAuth, checkLimits, (req, res) => {
  const base = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  proxyOllama(req, res, {
    targetUrl: `${base}/api${req.url}`,
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
