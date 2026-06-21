const jwt  = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    // Always check DB so suspensions / role changes take effect immediately
    const user = await User.findById(payload.userId).select('role status passwordChangedAt').lean();
    if (!user) return res.status(401).json({ error: 'User not found' });
    // Treat missing status field (pre-RBAC users) as active for backward compatibility
    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'Account not active', code: user.status.toUpperCase() });
    }
    // Reject tokens issued before a password change (iat is in seconds, Date in ms)
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime()) {
      return res.status(401).json({ error: 'Session invalidated — please log in again' });
    }
    req.userId   = payload.userId;
    req.username = payload.username;
    req.role     = user.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
};
