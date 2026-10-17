const User     = require('../models/User');
const UsageLog = require('../models/UsageLog');

// Ollama treats "nomic-embed-text" and "nomic-embed-text:latest" as the same model
const modelKey = (name) => (name.includes(':') ? name : `${name}:latest`);

module.exports = async function checkLimits(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('role limits allowedModels').lean();
    if (!user || user.role === 'admin') return next(); // admins are unlimited

    // Empty list = every model. Exposed (normalised) for the filtered /tags listing.
    req.allowedModels = (user.allowedModels ?? []).map(modelKey);

    // Only gate inference POST requests
    if (req.method !== 'POST' || !req.body?.model) return next();

    if (req.allowedModels.length && !req.allowedModels.includes(modelKey(String(req.body.model)))) {
      return res.status(403).json({ error: `You don't have access to ${req.body.model}. Ask your admin to enable it.` });
    }

    const { dailyTokens = 0, totalTokens = 0 } = user.limits || {};

    if (totalTokens > 0) {
      const [row] = await UsageLog.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: null, total: { $sum: '$totalTokens' } } },
      ]);
      if ((row?.total ?? 0) >= totalTokens) {
        return res.status(429).json({
          error: `Total token limit of ${totalTokens.toLocaleString()} reached. Contact your admin.`,
        });
      }
    }

    if (dailyTokens > 0) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const [row] = await UsageLog.aggregate([
        { $match: { userId: user._id, createdAt: { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$totalTokens' } } },
      ]);
      if ((row?.total ?? 0) >= dailyTokens) {
        return res.status(429).json({
          error: `Daily token limit of ${dailyTokens.toLocaleString()} reached. Resets at midnight.`,
        });
      }
    }

    next();
  } catch {
    // Fail closed: skipping this would also skip the model allowlist
    res.status(503).json({ error: 'Could not check your usage limits. Try again shortly.' });
  }
};

module.exports.modelKey = modelKey;
