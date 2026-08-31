const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'request_approved',
        'request_rejected',
        'trip_reminder',
        'payment',
        'system',
        'announcement',
        'discipline',
        'holiday',
        'birthday',
      ],
      default: 'system',
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      comment: 'Additional data for deep linking',
    },
    attachment: {
      url:          { type: String, default: null },
      original_name:{ type: String, default: null },
      mime_type:    { type: String, default: null },
      size:         { type: Number, default: 0 },
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true,
    },
    read_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

notificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });
notificationSchema.index({ user_id: 1, type: 1, created_at: -1 });

// TTL index to auto-delete old notifications after 90 days
notificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 7776000 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
