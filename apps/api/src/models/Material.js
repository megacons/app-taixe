const mongoose = require('mongoose');
const softDeletePlugin = require('./plugins/softDelete');

const materialSchema = new mongoose.Schema(
  {
    material_name: {
      type: String,
      required: [true, 'Tên vật liệu là bắt buộc'],
      unique: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    unit: {
      type: String,
      default: 'chuyến',
      trim: true,
    },
    default_price: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    category: {
      type: String,
      default: 'Đá xây dựng',
      trim: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

materialSchema.plugin(softDeletePlugin);

const Material = mongoose.model('Material', materialSchema);

module.exports = Material;
