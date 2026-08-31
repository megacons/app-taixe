const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên là bắt buộc'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Số điện thoại là bắt buộc'],
      unique: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Mật khẩu là bắt buộc'],
      select: false,
    },
    role: {
      type: String,
      enum: ['driver', 'employee', 'coordinator', 'accountant', 'manager'],
      required: [true, 'Vai trò là bắt buộc'],
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    fcm_token: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    last_login: {
      type: Date,
      default: null,
    },
    // Thông tin nhân viên
    employee_id: { type: String, default: null, trim: true },
    branch:      { type: String, default: null, trim: true },  // Chi nhánh
    department:  { type: String, default: null, trim: true },  // Phòng ban
    position:    { type: String, default: null, trim: true },  // Chức danh
    join_date:   { type: Date,   default: null },               // Ngày vào làm
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

userSchema.plugin(softDeletePlugin);

userSchema.index({ phone: 1, is_deleted: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
