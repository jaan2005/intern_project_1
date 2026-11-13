const mongoose = require('mongoose');
const { AppError } = require('./middleware/error');

// Find a document by id, or throw 404 (also handles malformed ids instead of crashing)
exports.findOr404 = async (Model, id, populate) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Not found', 404);
  let q = Model.findById(id);
  if (populate) q = q.populate(populate);
  const doc = await q;
  if (!doc) throw new AppError('Not found', 404);
  return doc;
};

exports.escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
