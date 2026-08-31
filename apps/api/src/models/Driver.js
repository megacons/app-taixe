const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const driverSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    employee_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    full_name: {
      type: String,
      required: [true, 'Họ tên là bắt buộc'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Số điện thoại là bắt buộc'],
      trim: true,
    },
    license_number: {
      type: String,
      trim: true,
    },
    license_type: {
      type: String,
      trim: true,
    },
    license_expiry: {
      type: Date,
    },
    id_card: {
      type: String,
      trim: true,
    },
    id_number: {             // alias rõ nghĩa hơn id_card
      type: String,
      trim: true,
    },
    id_issued_date: {
      type: Date,
    },
    id_issued_place: {
      type: String,
      trim: true,
    },
    date_of_birth: {
      type: Date,
    },
    address: {
      type: String,
      trim: true,
    },
    hire_date: {             // alias rõ nghĩa hơn join_date
      type: Date,
    },
    license_class: {         // hạng bằng lái (B2, C, D...)
      type: String,
      trim: true,
    },
    license_issue_date: {
      type: Date,
    },
    license_expiry_date: {
      type: Date,
    },
    bank_account: {
      type: String,
      trim: true,
    },
    bank_name: {
      type: String,
      trim: true,
    },
    id_card_image: {
      type: String,
      default: null,
    },
    id_card_image_back: {
      type: String,
      default: null,
    },
    department: {
      type: String,
      trim: true,
      default: 'Vận chuyển',
    },
    position: {
      type: String,
      trim: true,
      default: 'Tài xế',
    },
    join_date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on_leave', 'suspended'],
      default: 'active',
      index: true,
    },
    vehicle_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
    },
    emergency_contact: {
      name: String,
      phone: String,
      relationship: String,
    },
    base_salary: {
      type: Number,
      default: 0,
    },
    position_allowance: {
      type: Number,
      default: 0,
    },
    fuel_allowance: {
      type: Number,
      default: 0,
    },
    salary_note: {
      type: String,
      trim: true,
    },
    overtime_rate: {
      type: Number,
      default: 100000, // 100.000đ / chuyến tăng ca
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

driverSchema.plugin(softDeletePlugin);

const Driver = mongoose.model('Driver', driverSchema);

module.exports = Driver;
