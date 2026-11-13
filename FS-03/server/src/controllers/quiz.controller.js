const { z } = require('zod');
const Course = require('../models/Course');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Enrollment = require('../models/Enrollment');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404 } = require('../utils');
const { isOwnerOrAdmin, requireOwner } = require('../services/access');
const { gradeQuiz } = require('../services/grading');
const { refreshEnrollment } = require('../services/progress');

const quizSchema = z.object({
  title: z.string().min(2).max(150),
  passMark: z.number().int().min(1).max(100).default(60),
  questions: z
    .array(
      z.object({
        text: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(6),
        correctIndex: z.number().int().min(0),
      }).refine((q) => q.correctIndex < q.options.length, { message: 'correctIndex must point to one of the options' })
    )
    .min(1),
});

// Students must never receive the correct answers before attempting
const hideAnswers = (quiz) => ({
  id: quiz._id, course: quiz.course, title: quiz.title, passMark: quiz.passMark,
  questions: quiz.questions.map((q) => ({ id: q._id, text: q.text, options: q.options })),
});
const fullView = (quiz) => ({
  id: quiz._id, course: quiz.course, title: quiz.title, passMark: quiz.passMark,
  questions: quiz.questions.map((q) => ({ id: q._id, text: q.text, options: q.options, correctIndex: q.correctIndex })),
});

exports.create = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.courseId);
  requireOwner(course, req.user);
  const quiz = await Quiz.create({ ...quizSchema.parse(req.body), course: course._id });
  res.status(201).json({ quiz: fullView(quiz) });
});

exports.update = asyncHandler(async (req, res) => {
  const quiz = await findOr404(Quiz, req.params.id);
  requireOwner(await findOr404(Course, quiz.course), req.user);
  Object.assign(quiz, quizSchema.parse(req.body));
  await quiz.save();
  res.json({ quiz: fullView(quiz) });
});

exports.remove = asyncHandler(async (req, res) => {
  const quiz = await findOr404(Quiz, req.params.id);
  requireOwner(await findOr404(Course, quiz.course), req.user);
  await Promise.all([quiz.deleteOne(), QuizAttempt.deleteMany({ quiz: quiz._id })]);
  res.json({ message: 'Quiz deleted' });
});

// GET /api/courses/:courseId/quizzes
exports.listForCourse = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.courseId);
  const owner = isOwnerOrAdmin(course, req.user);
  const enrollment = owner ? null : await Enrollment.findOne({ user: req.user._id, course: course._id });
  if (!owner && !enrollment) throw new AppError('Enroll in this course to see its quizzes', 403);

  const quizzes = await Quiz.find({ course: course._id }).sort('createdAt');
  if (owner) return res.json({ quizzes: quizzes.map(fullView) });

  const best = await QuizAttempt.aggregate([
    { $match: { user: req.user._id, quiz: { $in: quizzes.map((q) => q._id) } } },
    { $group: { _id: '$quiz', bestScore: { $max: '$score' }, attempts: { $sum: 1 } } },
  ]);
  const bestBy = Object.fromEntries(best.map((b) => [String(b._id), b]));
  res.json({
    quizzes: quizzes.map((q) => ({
      ...hideAnswers(q),
      passed: enrollment.passedQuizzes.some((id) => String(id) === String(q._id)),
      bestScore: bestBy[String(q._id)]?.bestScore ?? null,
      attempts: bestBy[String(q._id)]?.attempts ?? 0,
    })),
  });
});

// POST /api/quizzes/:id/attempt  { answers: [1, 0, 2] }  -> auto-graded on the server
exports.attempt = asyncHandler(async (req, res) => {
  const { answers } = z.object({ answers: z.array(z.number().int().nullable()) }).parse(req.body);
  const quiz = await findOr404(Quiz, req.params.id);
  const enrollment = await Enrollment.findOne({ user: req.user._id, course: quiz.course });
  if (!enrollment) throw new AppError('You are not enrolled in this course', 403);

  const graded = gradeQuiz(quiz.questions, answers, quiz.passMark);
  await QuizAttempt.create({
    user: req.user._id, quiz: quiz._id, course: quiz.course, answers,
    correctCount: graded.correctCount, total: graded.total, score: graded.score, passed: graded.passed,
  });

  let progress = enrollment.progress;
  let completed = !!enrollment.completedAt;
  if (graded.passed) {
    await Enrollment.updateOne({ _id: enrollment._id }, { $addToSet: { passedQuizzes: quiz._id } });
    const fresh = await refreshEnrollment(await Enrollment.findById(enrollment._id));
    progress = fresh.progress;
    completed = !!fresh.completedAt;
  }
  // after submitting, the correct answers are revealed so the student can learn from mistakes
  res.json({ ...graded, passMark: quiz.passMark, progress, courseCompleted: completed });
});
