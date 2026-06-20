const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: true });

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title:    { type: String, default: 'New Chat' },
  model:    { type: String, default: '' },
  messages: [messageSchema],
}, { timestamps: true });

// Return chats list without messages (for sidebar)
chatSchema.statics.listForUser = function (userId) {
  return this.find({ userId }).select('-messages').sort('-createdAt').lean();
};

module.exports = mongoose.model('Chat', chatSchema);
