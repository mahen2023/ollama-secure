const router   = require('express').Router();
const User     = require('../models/User');
const ApiKey   = require('../models/ApiKey');
const Chat     = require('../models/Chat');
const UsageLog = require('../models/UsageLog');

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort('-createdAt').lean();

    const usageRows = await UsageLog.aggregate([
      { $group: { _id: '$userId', totalTokens: { $sum: '$totalTokens' }, totalRequests: { $sum: 1 } } },
    ]);
    const usageMap = Object.fromEntries(usageRows.map((r) => [r._id.toString(), r]));

    res.json(users.map((u) => ({
      ...u,
      usage: usageMap[u._id.toString()] ?? { totalTokens: 0, totalRequests: 0 },
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /admin/users/:id  — update status, role, or limits
router.patch('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.userId.toString()) {
      const { role, status } = req.body;
      if (role === 'user' || status === 'suspended') {
        return res.status(400).json({ error: 'Cannot demote or suspend your own account' });
      }
    }
    const { status, role, limits } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (role   !== undefined) update.role   = role;
    if (limits !== undefined) update.limits = limits;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/users/:id — hard delete + cascade
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.userId.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await User.findByIdAndDelete(req.params.id);
    await Chat.deleteMany({ userId: req.params.id });
    await ApiKey.updateMany({ userId: req.params.id }, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API Keys ──────────────────────────────────────────────────────────────────

// GET /admin/apikeys — all active keys with owner + usage stats
router.get('/apikeys', async (req, res) => {
  try {
    const keys = await ApiKey.find({ isActive: true }).sort('-createdAt').lean();

    const userIds = [...new Set(keys.map((k) => k.userId.toString()))];
    const users   = await User.find({ _id: { $in: userIds } }).select('username').lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.username]));

    const keyUsage = await UsageLog.aggregate([
      { $match: { apiKeyId: { $in: keys.map((k) => k._id) } } },
      { $group: { _id: '$apiKeyId', requests: { $sum: 1 }, tokens: { $sum: '$totalTokens' } } },
    ]);
    const keyUsageMap = Object.fromEntries(keyUsage.map((r) => [r._id.toString(), r]));

    res.json(keys.map((k) => ({
      ...k,
      username: userMap[k.userId.toString()] || '—',
      usage:    keyUsageMap[k._id.toString()] ?? { requests: 0, tokens: 0 },
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/apikeys/:id — revoke any key
router.delete('/apikeys/:id', async (req, res) => {
  try {
    await ApiKey.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

// GET /admin/analytics?days=30
router.get('/analytics', async (req, res) => {
  try {
    const days  = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [dailyUsage, topUsers, modelUsage, apiKeyActivity, summaryParts] = await Promise.all([
      UsageLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id:      { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          tokens:   { $sum: '$totalTokens' },
          requests: { $sum: 1 },
          webReqs:  { $sum: { $cond: [{ $eq: ['$source', 'web'] }, 1, 0] } },
          apiReqs:  { $sum: { $cond: [{ $eq: ['$source', 'api'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
      ]),

      UsageLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$userId', tokens: { $sum: '$totalTokens' }, requests: { $sum: 1 } } },
        { $sort: { tokens: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
        { $project: { username: '$u.username', tokens: 1, requests: 1 } },
      ]),

      UsageLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$model', tokens: { $sum: '$totalTokens' }, requests: { $sum: 1 } } },
        { $sort: { tokens: -1 } },
        { $limit: 10 },
      ]),

      UsageLog.aggregate([
        { $match: { createdAt: { $gte: since }, apiKeyId: { $ne: null } } },
        { $group: { _id: '$apiKeyId', tokens: { $sum: '$totalTokens' }, requests: { $sum: 1 } } },
        { $sort: { requests: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'apikeys', localField: '_id', foreignField: '_id', as: 'k' } },
        { $unwind: { path: '$k', preserveNullAndEmptyArrays: true } },
        { $project: { keyName: '$k.name', keyPrefix: '$k.keyPrefix', tokens: 1, requests: 1 } },
      ]),

      Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: 'active' }),
        User.countDocuments({ status: 'pending' }),
        ApiKey.countDocuments({ isActive: true }),
        UsageLog.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: null, tokens: { $sum: '$totalTokens' }, requests: { $sum: 1 } } },
        ]),
      ]),
    ]);

    const [totalUsers, activeUsers, pendingUsers, activeKeys, periodAgg] = summaryParts;

    res.json({
      summary: {
        totalUsers, activeUsers, pendingUsers, activeKeys, days,
        periodTokens:   periodAgg[0]?.tokens   ?? 0,
        periodRequests: periodAgg[0]?.requests ?? 0,
      },
      dailyUsage,
      topUsers,
      modelUsage,
      apiKeyActivity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
