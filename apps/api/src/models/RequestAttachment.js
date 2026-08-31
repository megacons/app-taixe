const mongoose = require('mongoose');

const requestAttachmentSchema = new mongoose.Schema(
  {
    request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request',
      required: true,
      index: true,
    },
    uploaded_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    file_type: {
      type: String,
      enum: ['image', 'pdf', 'document', 'other'],
      default: 'image',
    },
    mime_type: {
      type: String,
    },
    file_size: {
      type: Number,
    },
    attachment_type: {
      type: String,
      enum: ['invoice', 'receipt', 'supporting_doc', 'weigh_ticket', 'photo'],
      default: 'photo',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const RequestAttachment = mongoose.model('RequestAttachment', requestAttachmentSchema);

module.exports = RequestAttachment;
