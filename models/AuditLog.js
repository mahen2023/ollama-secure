const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  username: { type: String },   // denormalized from JWT so it survives user deletion
  action:   { type: String, required: true, index: true },
  details:  { type: mongoose.Schema.Types.Mixed },
  ip:       { type: String },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
