const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    certificateId: { type: String, required: true, unique: true }, // public ID used for verification
    // Names are copied in, so the certificate stays valid even if the course is renamed or deleted
    studentName: String,
    courseTitle: String,
    instructorName: String,
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

certificateSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Certificate', certificateSchema);
