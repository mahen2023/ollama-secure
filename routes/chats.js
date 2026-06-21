const router         = require('express').Router();
const Chat           = require('../models/Chat');
const pdfParse       = require('pdf-parse');
const makeRateLimiter = require('../middleware/rateLimit');
let mammoth;
try { mammoth = require('mammoth'); } catch { /* optional — DOCX support */ }

// 10 MB base64 ≈ 7.5 MB decoded file — keeps pdf-parse memory usage sane
const MAX_EXTRACT_B64 = 10 * 1024 * 1024;
// 5 MB base64 per image ≈ 3.75 MB decoded — enforces the client-side resize contract
const MAX_IMAGE_B64   =  5 * 1024 * 1024;

const extractRateLimit = makeRateLimiter({ windowMs: 60_000, max: 10,
  message: 'Too many extract requests — wait a minute and try again' });

// POST /chats/extract-text — server-side text extraction for PDF / DOCX
// Body: { base64: string, mimeType: string }
router.post('/extract-text', extractRateLimit, async (req, res) => {
  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) {
    return res.status(400).json({ error: 'base64 and mimeType are required' });
  }
  if (base64.length > MAX_EXTRACT_B64) {
    return res.status(413).json({ error: 'File too large (max ~7 MB)' });
  }
  try {
    const buffer = Buffer.from(base64, 'base64');

    if (mimeType === 'application/pdf') {
      const data = await pdfParse(buffer);
      return res.json({ text: data.text.trim() });
    }

    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (mimeType === DOCX) {
      if (!mammoth) return res.status(501).json({ error: 'DOCX support not installed (run: npm install mammoth)' });
      const result = await mammoth.extractRawText({ buffer });
      return res.json({ text: result.value.trim() });
    }

    res.status(400).json({ error: `Unsupported type: ${mimeType}` });
  } catch (err) {
    res.status(500).json({ error: 'Text extraction failed: ' + err.message });
  }
});

// GET /chats — list (no messages)
router.get('/', async (req, res) => {
  try {
    const chats = await Chat.listForUser(req.userId);
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chats — create
router.post('/', async (req, res) => {
  try {
    const { title, model } = req.body;
    const chat = await Chat.create({ userId: req.userId, title: title || 'New Chat', model: model || '' });
    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /chats/:id — full chat with messages
router.get('/:id', async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.userId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /chats/:id — update title / model
router.patch('/:id', async (req, res) => {
  try {
    const allowed = {};
    if (req.body.title        !== undefined) allowed.title        = req.body.title;
    if (req.body.model        !== undefined) allowed.model        = req.body.model;
    if (req.body.systemPrompt !== undefined) allowed.systemPrompt = req.body.systemPrompt;
    if (req.body.tags         !== undefined) {
      allowed.tags = Array.isArray(req.body.tags)
        ? req.body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
        : [];
    }
    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      allowed,
      { new: true }
    ).select('-messages');
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /chats/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await Chat.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!result) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /chats/:id/messages — append messages (user + assistant)
router.post('/:id/messages', async (req, res) => {
  try {
    const { messages } = req.body; // [{ role, content }]
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    // Reject oversized images before they reach MongoDB
    for (const m of messages) {
      if (!Array.isArray(m.images)) continue;
      for (const img of m.images) {
        if (typeof img.dataUri === 'string' && img.dataUri.length > MAX_IMAGE_B64) {
          return res.status(413).json({ error: 'Image too large — maximum ~4 MB per image after compression' });
        }
      }
    }
    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $push: { messages: { $each: messages } } },
      { new: true }
    );
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /chats/:id/messages/truncate — keep only the first N messages
router.patch('/:id/messages/truncate', async (req, res) => {
  const fromIndex = parseInt(req.body.fromIndex, 10);
  if (!Number.isFinite(fromIndex) || fromIndex < 0) {
    return res.status(400).json({ error: 'fromIndex must be a non-negative integer' });
  }
  try {
    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $push: { messages: { $each: [], $slice: fromIndex } } },
      { new: true }
    );
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /chats/:id/messages — clear history
router.delete('/:id/messages', async (req, res) => {
  try {
    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: { messages: [] } },
      { new: true }
    );
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
