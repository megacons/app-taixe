const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const requestSchema = new mongoose.Schema(
  {
    request_number: {
      type: String,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'salary_advance',
        'reward',
        'discipline',
        'attendance_adjustment',
        'leave',
        'expense',
        'purchase',
        'additional_trip',
        'trip_delete',
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    created_by: {
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
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approved_at: {
      type: Date,
      default: null,
    },
    rejection_reason: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        type: {
          type: String,
          enum: ['invoice', 'receipt', 'document', 'photo', 'other'],
        },
        url: String,
        filename: String,
        uploaded_at: { type: Date, default: Date.now },
      },
    ],
    timeline: [
      {
        action: {
          type: String,
          enum: ['created', 'submitted', 'approved', 'rejected', 'completed', 'cancelled'],
        },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        at: {
          type: Date,
          default: Date.now,
        },
        comment: String,
      },
    ],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

requestSchema.plugin(softDeletePlugin);

// Auto-generate request number
requestSchema.pre('save', async function (next) {
  if (this.isNew && !this.request_number) {
    const count = await mongoose.model('Request').countDocuments();
    const prefix = this.type.substring(0, 3).toUpperCase();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.request_number = `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

requestSchema.index({ created_by: 1, type: 1, status: 1 });

const Request = mongoose.model('Request', requestSchema);

module.exports = Request;
