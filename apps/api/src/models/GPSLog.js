const mongoose = require('mongoose');

const gpsLogSchema = new mongoose.Schema(
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
    trip_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      default: null,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    accuracy: {
      type: Number,
      comment: 'GPS accuracy in meters',
    },
    speed: {
      type: Number,
      comment: 'Speed in km/h',
    },
    heading: {
      type: Number,
      comment: 'Direction in degrees',
    },
    recorded_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Compound indexes for efficient queries
gpsLogSchema.index({ driver_id: 1, recorded_at: -1 });
gpsLogSchema.index({ vehicle_id: 1, recorded_at: -1 });
gpsLogSchema.index({ trip_id: 1, recorded_at: 1 });

// TTL index to auto-delete old GPS logs after 90 days
// Note: recorded_at TTL index only (not duplicated)
gpsLogSchema.index({ recorded_at: 1 }, { expireAfterSeconds: 7776000 });

const GPSLog = mongoose.model('GPSLog', gpsLogSchema);

module.exports = GPSLog;
