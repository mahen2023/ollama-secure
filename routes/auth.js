const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Chat   = require('../models/Chat');
const ApiKey = require('../models/ApiKey');

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

// PATCH /auth/password — change own password
router.patch('/password', require('../middleware/auth'), async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    if (!current || !newPassword)
      return res.status(400).json({ error: 'Current password and new password are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await user.comparePassword(current);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    user.password = newPassword; // pre-save hook hashes it + stamps passwordChangedAt
    await user.save();
    // Return a fresh token so the client doesn't have to re-login after a password change
    res.json({ success: true, token: sign(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /auth/account — self-deletion with password confirmation
router.delete('/account', require('../middleware/auth'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required to confirm deletion' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Guard: prevent deleting the sole active admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', status: 'active' });
      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the only active admin account — promote another user to admin first',
        });
      }
    }

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    await Promise.all([
      Chat.deleteMany({ userId: req.userId }),
      ApiKey.updateMany({ userId: req.userId }, { isActive: false }),
      User.findByIdAndDelete(req.userId),
    ]);

    res.json({ success: true });
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
