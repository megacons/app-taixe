const mongoose = require('mongoose');

const requestHistorySchema = new mongoose.Schema(
  {
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      comment: 'Type of the request',
    },
    action: {
      type: String,
      enum: ['created', 'updated', 'submitted', 'approved', 'rejected', 'completed', 'cancelled'],
      required: true,
    },
    old_status: {
      type: String,
      default: null,
    },
    new_status: {
      type: String,
      required: true,
    },
    comment: {
      type: String,
      trim: true,
    },
    action_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      comment: 'Fields that were changed',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

requestHistorySchema.index({ request_id: 1, created_at: -1 });

const RequestHistory = mongoose.model('RequestHistory', requestHistorySchema);

module.exports = RequestHistory;
