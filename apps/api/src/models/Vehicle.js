const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const vehicleSchema = new mongoose.Schema(
  {
    license_plate: {
      type: String,
      required: [true, 'Biển số xe là bắt buộc'],
      trim: true,
      uppercase: true,
    },
    vehicle_type: {
      type: String,
      enum: ['truck', 'dump_truck', 'trailer', 'pickup', 'other'],
      default: 'dump_truck',
    },
    brand: {
      type: String,
      trim: true,
    },
    model: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
    },
    capacity: {
      type: Number,
      comment: 'Tải trọng (tấn)',
    },
    status: {
      type: String,
      enum: ['active', 'maintenance', 'inactive', 'broken'],
      default: 'active',
      index: true,
    },
    assigned_driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    registration_date: {
      type: Date,
    },
    insurance_expiry: {
      type: Date,
    },
    last_maintenance: {
      type: Date,
    },
    next_maintenance: {
      type: Date,
    },
    notes: {
      type: String,
    },
    gps_enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

vehicleSchema.plugin(softDeletePlugin);

// Unique index chỉ áp dụng cho xe chưa bị soft-delete
vehicleSchema.index(
  { license_plate: 1 },
  { unique: true, partialFilterExpression: { is_deleted: { $ne: true } } }
);

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
