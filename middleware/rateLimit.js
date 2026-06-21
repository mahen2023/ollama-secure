// Simple per-user in-memory sliding-window rate limiter.
// No external dependency — suitable for single-process deployments.
// For multi-process deployments, replace with Redis-backed express-rate-limit.
function makeRateLimiter({ windowMs = 60_000, max = 10, message = 'Too many requests — try again later' } = {}) {
  // Map<userId|ip, { count, resetAt }>
  const store = new Map();

  // Periodically remove expired entries so the Map doesn't grow unbounded.
  // .unref() ensures this interval won't keep the Node process alive on shutdown.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const key = req.userId ?? req.ip;
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count += 1;
    res.set('X-RateLimit-Limit',     String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.set('X-RateLimit-Reset',     String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = makeRateLimiter;
