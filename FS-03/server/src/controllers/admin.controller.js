const { z } = require('zod');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404 } = require('../utils');
const { courseView } = require('./course.controller');

exports.users = asyncHandler(async (req, res) => {
  const users = await User.find().sort('-createdAt');
  res.json({ users: users.map((u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })) });
});

exports.setRole = asyncHandler(async (req, res) => {
  const { role } = z.object({ role: z.enum(['student', 'instructor', 'admin']) }).parse(req.body);
  const user = await findOr404(User, req.params.id);
  if (String(user._id) === String(req.user._id)) throw new AppError('You cannot change your own role', 400);
  user.role = role;
  await user.save();
  res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

exports.courses = asyncHandler(async (req, res) => {
  const courses = await Course.find().sort('-createdAt').populate('instructor', 'name');
  res.json({ courses: courses.map(courseView) });
});

exports.stats = asyncHandler(async (req, res) => {
  const [roles, courses, published, enrollments, revenue] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Course.countDocuments(),
    Course.countDocuments({ published: true }),
    Enrollment.countDocuments(),
    Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, gross: { $sum: '$amountCents' }, fees: { $sum: '$platformFeeCents' } } }]),
  ]);
  res.json({
    users: Object.fromEntries(roles.map((r) => [r._id, r.n])),
    courses, publishedCourses: published, enrollments,
    grossCents: revenue[0]?.gross || 0, platformFeeCents: revenue[0]?.fees || 0,
  });
});
