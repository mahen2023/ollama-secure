const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true,
    trim: true, lowercase: true, minlength: 3, maxlength: 30,
  },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin', 'user'], default: 'user' },
  status:   { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
  limits: {
    dailyTokens: { type: Number, default: 0 }, // 0 = unlimited
    totalTokens: { type: Number, default: 0 },
  },
  settings: {
    systemPrompt:  { type: String,  default: '' },
    temperature:   { type: Number,  default: 0.7 },
    contextLength: { type: Number,  default: 4096 },
    streamEnabled: { type: Boolean, default: true },
    selectedModel: { type: String,  default: '' },
  },
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id:        this._id,
    username:  this.username,
    role:      this.role,
    status:    this.status,
    limits:    this.limits,
    settings:  this.settings,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
