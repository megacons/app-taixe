const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const tripSchema = new mongoose.Schema(
  {
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
    },
    trip_date: {
      type: Date,
      required: [true, 'Ngày chuyến là bắt buộc'],
      index: true,
    },
    material_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Material',
      default: null,
    },
    material_name: {
      type: String,
      required: [true, 'Tên vật liệu là bắt buộc'],
      trim: true,
    },
    quantity: {
      type: Number,
      default: null,
    },
    unit: {
      type: String,
      trim: true,
      default: null,
    },
    pickup_location: {
      type: String,
      required: [true, 'Nơi lấy là bắt buộc'],
      trim: true,
    },
    drop_location: {
      type: String,
      required: [true, 'Nơi đổ là bắt buộc'],
      trim: true,
    },
    income: {
      type: Number,
      default: 0,
      min: 0,
    },
    expense: {
      type: Number,
      default: 0,
      min: 0,
    },
    note: {
      type: String,
      trim: true,
    },
    delivery_receipt: {
      type: String,
      default: null,
      comment: 'URL ảnh biên nhận',
    },
    receipt_images: [
      {
        url: String,
        uploaded_at: { type: Date, default: Date.now },
      },
    ],
    gps_latitude: {
      type: Number,
    },
    gps_longitude: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['draft', 'completed', 'cancelled'],
      default: 'completed',
      index: true,
    },
    trip_number: {
      type: Number,
      comment: 'Số chuyến trong ngày của tài xế đó',
    },
    is_overtime: {
      type: Boolean,
      default: false,
      index: true,
    },
    overtime_pay: {
      type: Number,
      default: 0,
    },
    synced_from_offline: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

tripSchema.plugin(softDeletePlugin);

// Compound index for daily queries
tripSchema.index({ driver_id: 1, trip_date: 1 });
tripSchema.index({ vehicle_id: 1, trip_date: 1 });

const Trip = mongoose.model('Trip', tripSchema);

module.exports = Trip;
