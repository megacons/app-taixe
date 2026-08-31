const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên địa điểm là bắt buộc'],
      trim: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ['pickup', 'drop', 'both'],
      default: 'both',
    },
    address: {
      type: String,
      trim: true,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

locationSchema.plugin(softDeletePlugin);

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
