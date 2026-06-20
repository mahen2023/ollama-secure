const router = require('express').Router();
const ApiKey = require('../models/ApiKey');

// GET /apikeys — list active keys for the logged-in user (no hashes exposed)
router.get('/', async (req, res) => {
  try {
    const keys = await ApiKey
      .find({ userId: req.userId, isActive: true })
      .select('name keyPrefix lastUsed createdAt')
      .sort('-createdAt')
      .lean();
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /apikeys — create a new API key; returns plaintext once
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Key name is required' });
    }
    const { raw, hash, prefix } = ApiKey.generate();
    const apiKey = await ApiKey.create({
      userId:    req.userId,
      name:      name.trim(),
      keyHash:   hash,
      keyPrefix: prefix,
    });
    // ⚠️  `raw` is returned exactly once — it is never stored
    res.status(201).json({
      id:        apiKey._id,
      name:      apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
      key:       raw,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /apikeys/:id — revoke (soft-delete)
router.delete('/:id', async (req, res) => {
  try {
    const key = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isActive: false },
      { new: true }
    );
    if (!key) return res.status(404).json({ error: 'API key not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
