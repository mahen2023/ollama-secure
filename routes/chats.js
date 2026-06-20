const router = require('express').Router();
const Chat   = require('../models/Chat');

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
    if (req.body.title !== undefined) allowed.title = req.body.title;
    if (req.body.model !== undefined) allowed.model = req.body.model;
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
