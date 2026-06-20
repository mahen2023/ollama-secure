require('dotenv').config();
const express  = require('express');
const axios    = require('axios');
const path     = require('path');
const mongoose = require('mongoose');

const app = express();

// ── MongoDB ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ollama-chat')
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB error:', err.message));

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── React client at /chat (no auth) ─────────────────────────────────────────
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
app.use('/chat', express.static(CLIENT_DIST));
app.use('/chat', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
app.get('/', (_req, res) => res.redirect('/chat'));

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '4mb' }));

// ── Public auth routes ────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));

// ── Protected routes ─────────────────────────────────────────────────────────
const requireAuth = require('./middleware/auth');
app.use('/chats',    requireAuth, require('./routes/chats'));
app.use('/settings', requireAuth, require('./routes/settings'));

// ── Ollama proxy (JWT protected) ──────────────────────────────────────────────
app.use('/api', requireAuth, async (req, res) => {
  try {
    const base = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    const response = await axios({
      method: req.method,
      url: `${base}${req.originalUrl}`,
      data: req.body,
      responseType: 'stream',
      headers: { 'Content-Type': 'application/json' },
    });
    response.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Ollama App → http://localhost:${PORT}/chat`));
