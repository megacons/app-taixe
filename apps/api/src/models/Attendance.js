const mongoose = require('mongoose');

// Mỗi lần vào/ra là 1 session trong ngày
const sessionSchema = new mongoose.Schema({
  check_in_time:  { type: Date, default: null },
  check_out_time: { type: Date, default: null },
  check_in_photo: { type: String, default: null },
  check_in_lat:   { type: Number, default: null },
  check_in_lng:   { type: Number, default: null },
  check_in_addr:  { type: String, default: null },
}, { _id: true });

const attendanceSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,   // 'YYYY-MM-DD'
      required: true,
      index: true,
    },
    // Mảng sessions — hỗ trợ vào/ra nhiều lần trong ngày
    sessions: { type: [sessionSchema], default: [] },

    // Fields tổng hợp (lấy từ session đầu tiên/cuối cùng để tương thích cũ)
    check_in_time:  { type: Date, default: null },   // = sessions[0].check_in_time
    check_out_time: { type: Date, default: null },   // = sessions cuối .check_out_time
    check_in_photo: { type: String, default: null },
    check_in_lat:   { type: Number, default: null },
    check_in_lng:   { type: Number, default: null },
    check_in_addr:  { type: String, default: null },
    shift_name:     { type: String, default: 'Ca VP (08:00-17:00)' },
    status: {
      type: String,
      enum: ['pending', 'checked_in', 'checked_out'],
      default: 'pending',
    },
    note: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

attendanceSchema.index({ user_id: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);
module.exports = Attendance;
