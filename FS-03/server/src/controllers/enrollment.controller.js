const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404 } = require('../utils');
const { courseView } = require('./course.controller');

// POST /api/courses/:id/enroll  -> FREE courses only. Paid courses go through Stripe checkout.
exports.enrollFree = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.id);
  if (!course.published) throw new AppError('Course is not available', 404);
  if (course.priceCents > 0) throw new AppError('This course is paid. Use checkout.', 402);
  const enrollment = await Enrollment.findOneAndUpdate(
    { user: req.user._id, course: course._id },
    { $setOnInsert: { user: req.user._id, course: course._id } },
    { upsert: true, new: true }
  );
  res.status(201).json({ enrollment: { id: enrollment._id, progress: enrollment.progress } });
});

// GET /api/enrollments/me
exports.mine = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ user: req.user._id }).sort('-createdAt').populate({ path: 'course', populate: { path: 'instructor', select: 'name' } });
  res.json({
    enrollments: enrollments
      .filter((e) => e.course) // course may have been deleted
      .map((e) => ({ id: e._id, progress: e.progress, completed: !!e.completedAt, course: courseView(e.course) })),
  });
});
