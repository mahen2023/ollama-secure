const mongoose = require('mongoose');
const { Schema } = mongoose;

const usageLogSchema = new Schema({
  userId:           { type: Schema.Types.ObjectId, ref: 'User',   required: true },
  apiKeyId:         { type: Schema.Types.ObjectId, ref: 'ApiKey', default: null },
  model:            { type: String, default: '' },
  promptTokens:     { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  totalTokens:      { type: Number, default: 0 },
  source:           { type: String, enum: ['web', 'api'], default: 'web' },
}, { timestamps: true });

usageLogSchema.index({ userId:   1, createdAt: -1 });
usageLogSchema.index({ apiKeyId: 1, createdAt: -1 });
usageLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UsageLog', usageLogSchema);
