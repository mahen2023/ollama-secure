const mongoose = require('mongoose');
const crypto   = require('crypto');

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name:      { type: String, required: true, trim: true },
  keyHash:   { type: String, required: true, unique: true }, // SHA-256 — never store plaintext
  keyPrefix: { type: String, required: true },               // First 12 chars for display
  isActive:  { type: Boolean, default: true, index: true },
  lastUsed:  { type: Date, default: null },
}, { timestamps: true });

// Generate a new key: returns plaintext (shown once) + hash + prefix for storage
apiKeySchema.statics.generate = function () {
  const raw    = 'ok_' + crypto.randomBytes(32).toString('hex'); // 67 chars
  const hash   = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12); // "ok_a1b2c3d4e5"
  return { raw, hash, prefix };
};

// Look up a key by its plaintext value
apiKeySchema.statics.findByKey = function (raw) {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return this.findOne({ keyHash: hash, isActive: true });
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
