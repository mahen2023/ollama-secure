const ApiKey = require('../models/ApiKey');
const User   = require('../models/User');

module.exports = async function apiKeyAuth(req, res, next) {
  const raw = req.headers['x-api-key'];
  if (!raw) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }
  try {
    const key = await ApiKey.findByKey(raw);
    if (!key) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }
    const user = await User.findById(key.userId).select('status role').lean();
    if (!user || user.status !== 'active') {
      return res.status(403).json({ error: 'Account not active' });
    }
    ApiKey.findByIdAndUpdate(key._id, { lastUsed: new Date() }).exec().catch(() => {});
    req.userId   = key.userId;
    req.role     = user.role;
    req.apiKeyId = key._id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
