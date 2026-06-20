const router = require('express').Router();
const User   = require('../models/User');

// GET /settings
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('settings');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /settings — replace all settings
router.put('/', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { settings: req.body },
      { new: true }
    ).select('settings');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /settings — partial update
router.patch('/', async (req, res) => {
  try {
    const $set = {};
    Object.entries(req.body).forEach(([k, v]) => { $set[`settings.${k}`] = v; });
    const user = await User.findByIdAndUpdate(req.userId, { $set }, { new: true }).select('settings');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
