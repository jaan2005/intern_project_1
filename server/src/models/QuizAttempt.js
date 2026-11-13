const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    answers: [Number],
    correctCount: Number,
    total: Number,
    score: Number, // percent
    passed: Boolean,
  },
  { timestamps: true }
);

module.exports = mongoose.model('QuizAttempt', attemptSchema);
