const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const driverFinanceSchema = new mongoose.Schema(
  {
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      index: true,
      comment: 'Format: YYYY-MM',
    },
    total_trips: {
      type: Number,
      default: 0,
    },
    overtime_trips: {
      type: Number,
      default: 0,
    },
    total_income: {
      type: Number,
      default: 0,
    },
    total_expense: {
      type: Number,
      default: 0,
    },
    advances: [
      {
        date: Date,
        amount: Number,
        type: String,
        reason: String,
        request_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Request',
        },
      },
    ],
    total_advances: {
      type: Number,
      default: 0,
    },
    expenses: [
      {
        date: Date,
        amount: Number,
        type: String,
        detail: String,
        request_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Request',
        },
      },
    ],
    total_paid_expenses: {
      type: Number,
      default: 0,
    },
    rewards: [
      {
        date: Date,
        amount: Number,
        type: String,
        reason: String,
        request_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Request',
        },
      },
    ],
    total_rewards: {
      type: Number,
      default: 0,
    },
    disciplines: [
      {
        date: Date,
        amount: Number,
        type: String,
        reason: String,
        request_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Request',
        },
      },
    ],
    total_penalties: {
      type: Number,
      default: 0,
    },
    balance: {
      type: Number,
      default: 0,
      comment: 'Tiền còn lại = ứng - chi',
    },
    overtime_pay: {
      type: Number,
      default: 0,
    },
    net_salary: {
      type: Number,
      default: 0,
      comment: 'Lương thực nhận sau khi tính tất cả',
    },
    is_calculated: {
      type: Boolean,
      default: false,
    },
    calculated_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

driverFinanceSchema.plugin(softDeletePlugin);

driverFinanceSchema.index({ driver_id: 1, month: 1 }, { unique: true });

const DriverFinance = mongoose.model('DriverFinance', driverFinanceSchema);

module.exports = DriverFinance;
