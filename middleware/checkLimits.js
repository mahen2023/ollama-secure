const User     = require('../models/User');
const UsageLog = require('../models/UsageLog');

module.exports = async function checkLimits(req, res, next) {
  // Only gate inference POST requests
  if (req.method !== 'POST' || !req.body?.model) return next();

  try {
    const user = await User.findById(req.userId).select('role limits').lean();
    if (!user || user.role === 'admin') return next(); // admins are unlimited

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
    next(); // never block on limit-check errors
  }
};
