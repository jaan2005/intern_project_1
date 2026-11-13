const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' }, // empty for free courses
    completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
    passedQuizzes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quiz' }],
    progress: { type: Number, default: 0 }, // percent 0-100
    completedAt: Date,
  },
  { timestamps: true }
);

// A student can only be enrolled once per course
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
