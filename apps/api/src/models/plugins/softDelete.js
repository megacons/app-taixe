/**
 * Soft Delete Plugin for Mongoose
 * Adds deleted_at field and overrides find/findOne/count to exclude deleted documents
 */
function softDeletePlugin(schema) {
  schema.add({
    deleted_at: {
      type: Date,
      default: null,
      index: true,
    },
    is_deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  });

  // Add deleted_by if needed
  schema.add({
    deleted_by: {
      type: require('mongoose').Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  });

  // Override find queries to exclude soft-deleted documents by default
  const excludeDeleted = function () {
    if (this.getFilter().include_deleted) {
      delete this.getFilter().include_deleted;
    } else {
      this.where({ is_deleted: { $ne: true } });
    }
  };

  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('findOneAndUpdate', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);
  schema.pre('count', excludeDeleted);

  // Soft delete method
  schema.methods.softDelete = async function (userId = null) {
    this.deleted_at = new Date();
    this.is_deleted = true;
    this.deleted_by = userId;
    return this.save();
  };

  // Restore method
  schema.methods.restore = async function () {
    this.deleted_at = null;
    this.is_deleted = false;
    this.deleted_by = null;
    return this.save();
  };

  // Static method to find with deleted
  schema.statics.findWithDeleted = function (conditions = {}) {
    return this.find({ ...conditions, include_deleted: true });
  };

  // Static method to find only deleted
  schema.statics.findDeleted = function (conditions = {}) {
    return this.find({ ...conditions, is_deleted: true, include_deleted: true });
  };
}

module.exports = softDeletePlugin;
