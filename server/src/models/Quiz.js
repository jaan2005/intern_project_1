const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    options: { type: [String], validate: (v) => v.length >= 2 && v.length <= 6 },
    correctIndex: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true },
    passMark: { type: Number, default: 60, min: 1, max: 100 }, // percent needed to pass
    questions: { type: [questionSchema], validate: (v) => v.length >= 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Quiz', quizSchema);
