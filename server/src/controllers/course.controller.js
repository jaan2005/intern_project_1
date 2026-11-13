const { z } = require('zod');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');
const Enrollment = require('../models/Enrollment');
const storage = require('../services/storage');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404, escapeRegex } = require('../utils');
const { isOwnerOrAdmin, requireOwner } = require('../services/access');

const courseSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(5000).default(''),
  category: z.string().min(2).max(50).default('General'),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  priceCents: z.number().int().min(0).max(1000000).default(0),
});

const lessonView = (l, withUrl = false) => ({
  id: l._id,
  course: l.course,
  title: l.title,
  description: l.description,
  order: l.order,
  isPreview: l.isPreview,
  video: {
    status: l.video?.status || 'none',
    duration: l.video?.duration || 0,
    error: l.video?.error,
    url: withUrl && l.video?.status === 'ready' ? storage.publicUrl(l.video.playlistKey) : undefined,
  },
});

const courseView = (c) => ({
  id: c._id,
  title: c.title,
  description: c.description,
  category: c.category,
  level: c.level,
  priceCents: c.priceCents,
  published: c.published,
  instructor: c.instructor?._id ? { id: c.instructor._id, name: c.instructor.name } : c.instructor,
  createdAt: c.createdAt,
});

exports.lessonView = lessonView;
exports.courseView = courseView;

// GET /api/courses?search=&category=&page=&limit=   (public catalogue: published courses only)
exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
  const filter = { published: true };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) filter.title = new RegExp(escapeRegex(String(req.query.search)), 'i');

  const [total, courses] = await Promise.all([
    Course.countDocuments(filter),
    Course.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('instructor', 'name'),
  ]);
  const counts = await Lesson.aggregate([{ $match: { course: { $in: courses.map((c) => c._id) } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]);
  const byCourse = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({
    page, total, pages: Math.ceil(total / limit),
    courses: courses.map((c) => ({ ...courseView(c), lessonCount: byCourse[String(c._id)] || 0 })),
  });
});

// GET /api/courses/mine  (instructor's own courses incl. drafts)
exports.mine = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { instructor: req.user._id };
  const courses = await Course.find(filter).sort('-createdAt').populate('instructor', 'name');
  const ids = courses.map((c) => c._id);
  const [lessons, enrolls] = await Promise.all([
    Lesson.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
    Enrollment.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
  ]);
  const L = Object.fromEntries(lessons.map((x) => [String(x._id), x.n]));
  const E = Object.fromEntries(enrolls.map((x) => [String(x._id), x.n]));
  res.json({ courses: courses.map((c) => ({ ...courseView(c), lessonCount: L[String(c._id)] || 0, studentCount: E[String(c._id)] || 0 })) });
});

// GET /api/courses/:id  (public for published courses; drafts only visible to the owner/admin)
exports.get = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.id, { path: 'instructor', select: 'name' });
  const owner = isOwnerOrAdmin(course, req.user);
  if (!course.published && !owner) throw new AppError('Not found', 404);

  const [lessons, quizCount, enrollment] = await Promise.all([
    Lesson.find({ course: course._id }).sort('order createdAt'),
    Quiz.countDocuments({ course: course._id }),
    req.user ? Enrollment.findOne({ user: req.user._id, course: course._id }) : null,
  ]);
  res.json({
    course: courseView(course),
    // lesson list without video URLs; URLs are only given by GET /api/lessons/:id after an access check
    lessons: lessons.map((l) => lessonView(l, false)),
    quizCount,
    isOwner: owner,
    enrollment: enrollment ? { progress: enrollment.progress, completed: !!enrollment.completedAt, completedLessons: enrollment.completedLessons, passedQuizzes: enrollment.passedQuizzes } : null,
  });
});

exports.create = asyncHandler(async (req, res) => {
  const data = courseSchema.parse(req.body);
  const course = await Course.create({ ...data, instructor: req.user._id });
  res.status(201).json({ course: courseView(course) });
});

exports.update = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.id);
  requireOwner(course, req.user);
  Object.assign(course, courseSchema.partial().parse(req.body));
  await course.save();
  res.json({ course: courseView(course) });
});

// PATCH /api/courses/:id/publish  { published: true|false }
exports.publish = asyncHandler(async (req, res) => {
  const { published } = z.object({ published: z.boolean() }).parse(req.body);
  const course = await findOr404(Course, req.params.id);
  requireOwner(course, req.user);
  if (published) {
    const ready = await Lesson.countDocuments({ course: course._id, 'video.status': 'ready' });
    if (ready === 0) throw new AppError('Add at least one lesson with a processed video before publishing', 400);
  }
  course.published = published;
  await course.save();
  res.json({ course: courseView(course) });
});

exports.remove = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.id);
  requireOwner(course, req.user);
  if (await Enrollment.exists({ course: course._id })) throw new AppError('Students are enrolled. Unpublish the course instead of deleting it.', 409);
  const lessons = await Lesson.find({ course: course._id });
  await Promise.all(lessons.map((l) => storage.removePrefix(l.video?.prefix).catch(() => {})));
  await Promise.all([Lesson.deleteMany({ course: course._id }), Quiz.deleteMany({ course: course._id }), course.deleteOne()]);
  res.json({ message: 'Course deleted' });
});
