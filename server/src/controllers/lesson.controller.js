const fs = require('fs');
const { z } = require('zod');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const storage = require('../services/storage');
const { enqueueTranscode } = require('../queues/videoQueue');
const { asyncHandler, AppError } = require('../middleware/error');
const { findOr404 } = require('../utils');
const { isOwnerOrAdmin, requireOwner, canAccessCourse } = require('../services/access');
const { refreshEnrollment } = require('../services/progress');
const { lessonView } = require('./course.controller');

const lessonSchema = z.object({
  title: z.string().min(2).max(150),
  description: z.string().max(5000).default(''),
  order: z.number().int().min(0).optional(),
  isPreview: z.boolean().default(false),
});

exports.create = asyncHandler(async (req, res) => {
  const course = await findOr404(Course, req.params.courseId);
  requireOwner(course, req.user);
  const data = lessonSchema.parse(req.body);
  if (data.order === undefined) data.order = await Lesson.countDocuments({ course: course._id });
  const lesson = await Lesson.create({ ...data, course: course._id });
  res.status(201).json({ lesson: lessonView(lesson) });
});

exports.update = asyncHandler(async (req, res) => {
  const lesson = await findOr404(Lesson, req.params.id);
  requireOwner(await findOr404(Course, lesson.course), req.user);
  Object.assign(lesson, lessonSchema.partial().parse(req.body));
  await lesson.save();
  res.json({ lesson: lessonView(lesson) });
});

exports.remove = asyncHandler(async (req, res) => {
  const lesson = await findOr404(Lesson, req.params.id);
  requireOwner(await findOr404(Course, lesson.course), req.user);
  await storage.removePrefix(lesson.video?.prefix).catch(() => {});
  await lesson.deleteOne();
  res.json({ message: 'Lesson deleted' });
});

// GET /api/lessons/:id  -> the only place a video URL is handed out
exports.get = asyncHandler(async (req, res) => {
  const lesson = await findOr404(Lesson, req.params.id);
  const course = await findOr404(Course, lesson.course);
  const owner = isOwnerOrAdmin(course, req.user);
  // students can only watch published courses; free-preview lessons are open to everyone
  if (!owner && !course.published) throw new AppError('Not found', 404);
  const allowed = lesson.isPreview || (await canAccessCourse(course, req.user));
  if (!allowed) throw new AppError('Enroll in this course to watch this lesson', 403);
  res.json({ lesson: lessonView(lesson, true) });
});

// POST /api/lessons/:id/video  (multipart, field "video")
// The API only saves the file and queues a job, then replies immediately.
exports.uploadVideo = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError('No video file received (field name must be "video")', 400);
  const discard = () => fs.rm(file.path, { force: true }, () => {});
  try {
    const lesson = await findOr404(Lesson, req.params.id);
    requireOwner(await findOr404(Course, lesson.course), req.user);

    const oldPrefix = lesson.video?.prefix;
    lesson.video.status = 'queued';
    lesson.video.error = undefined;
    lesson.video.originalName = file.originalname;
    await lesson.save();

    try {
      await enqueueTranscode({ lessonId: String(lesson._id), inputPath: file.path, originalName: file.originalname, oldPrefix });
    } catch (err) {
      lesson.video.status = oldPrefix ? 'ready' : 'none';
      await lesson.save();
      throw new AppError(err.message, 503);
    }
    res.status(202).json({ message: 'Upload received. Processing started.', lesson: lessonView(lesson) });
  } catch (err) {
    discard();
    throw err;
  }
});

// POST /api/lessons/:id/complete  (student marks a lesson as finished)
exports.complete = asyncHandler(async (req, res) => {
  const lesson = await findOr404(Lesson, req.params.id);
  const enrollment = await Enrollment.findOne({ user: req.user._id, course: lesson.course });
  if (!enrollment) throw new AppError('You are not enrolled in this course', 403);
  await Enrollment.updateOne({ _id: enrollment._id }, { $addToSet: { completedLessons: lesson._id } });
  const fresh = await refreshEnrollment(await Enrollment.findById(enrollment._id));
  res.json({ progress: fresh.progress, completed: !!fresh.completedAt });
});
