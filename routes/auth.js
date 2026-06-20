const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');

const sign = (user) =>
  jwt.sign(
    { userId: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // First user ever becomes admin and is immediately active
    const isFirst = (await User.countDocuments()) === 0;

    const user = await User.create({
      username: username.trim(),
      password,
      role:   isFirst ? 'admin' : 'user',
      status: isFirst ? 'active' : 'pending',
    });

    if (user.status === 'pending') {
      return res.status(202).json({ pending: true });
    }

    res.status(201).json({ token: sign(user), user: user.toSafeObject() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.trim()?.toLowerCase() });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({
        error: 'Your account is awaiting admin approval.',
        code: 'PENDING',
      });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended. Contact your admin.',
        code: 'SUSPENDED',
      });
    }
    res.json({ token: sign(user), user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me  — verify token + return fresh user data
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
