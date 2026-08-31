const mongoose = require('mongoose');

const tripImageSchema = new mongoose.Schema(
  {
    trip_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
      index: true,
    },
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
    },
    file_size: {
      type: Number,
      comment: 'File size in bytes',
    },
    image_type: {
      type: String,
      enum: ['delivery_receipt', 'weigh_ticket', 'other'],
      default: 'delivery_receipt',
    },
    uploaded_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

tripImageSchema.index({ trip_id: 1, image_type: 1 });

const TripImage = mongoose.model('TripImage', tripImageSchema);

module.exports = TripImage;
